import React, { ChangeEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  Download,
  FileDown,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Wand2
} from "lucide-react";
import "./index.css";
import {
  ApiError,
  GenerateImageInput,
  ProviderProfile,
  buildUrl,
  createEmptyProfile,
  createProviderAdapter
} from "./services/api";

type AppView = "generate" | "settings";

type HistoryItem = {
  id: string;
  prompt: string;
  imageUrl: string;
  providerName: string;
  model: string;
  size: string;
  createdAt: string;
};

type ReferenceImage = {
  id: string;
  name: string;
  dataUrl: string;
};

const STORAGE_KEYS = {
  profiles: "image-studio:profiles:v1",
  activeProfileId: "image-studio:active-profile-id:v1",
  history: "image-studio:history:v1"
};

const sizeOptions = [
  { value: "2048x1152", label: "16:9", note: "2048 x 1152" },
  { value: "1152x2048", label: "9:16", note: "1152 x 2048" },
  { value: "2048x2048", label: "1:1", note: "2048 x 2048" },
  { value: "2048x1536", label: "4:3", note: "2048 x 1536" },
  { value: "1536x2048", label: "3:4", note: "1536 x 2048" },
  { value: "1536x1024", label: "3:2", note: "1536 x 1024" },
  { value: "1024x1536", label: "2:3", note: "1024 x 1536" }
];

const qualityOptions: GenerateImageInput["quality"][] = ["high", "medium", "low", "auto"];

function App() {
  const [view, setView] = useState<AppView>("generate");
  const [profiles, setProfiles] = useState<ProviderProfile[]>(() => loadProfiles());
  const [activeProfileId, setActiveProfileId] = useState<string>(() => loadActiveProfileId());
  const [draftProfile, setDraftProfile] = useState<ProviderProfile>(() => createEmptyProfile());
  const [references, setReferences] = useState<ReferenceImage[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState(sizeOptions[0].value);
  const [quality, setQuality] = useState<GenerateImageInput["quality"]>("high");
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"" | "error" | "success">("");
  const [settingsNotice, setSettingsNotice] = useState("");
  const [settingsNoticeTone, setSettingsNoticeTone] = useState<"" | "error" | "success">("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [resultImageUrl, setResultImageUrl] = useState("");
  const [resultMeta, setResultMeta] = useState("等待生成");

  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) || null;

  useEffect(() => {
    if (!profiles.length) {
      setActiveProfileId("");
      setDraftProfile(createEmptyProfile());
      return;
    }

    const existing = profiles.find((profile) => profile.id === activeProfileId);
    if (existing) {
      setDraftProfile(existing);
      return;
    }

    setActiveProfileId(profiles[0].id);
  }, [activeProfileId, profiles]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(profiles));
  }, [profiles]);

  useEffect(() => {
    if (activeProfileId) {
      window.localStorage.setItem(STORAGE_KEYS.activeProfileId, activeProfileId);
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.activeProfileId);
    }
  }, [activeProfileId]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history.slice(0, 10)));
  }, [history]);

  function updateDraftProfile<K extends keyof ProviderProfile>(key: K, value: ProviderProfile[K]) {
    setDraftProfile((current) => {
      const next = { ...current, [key]: value };
      if (key === "protocol" && value === "openai-compatible") {
        next.generatePath = "/images/generations";
        next.editPath = "/images/edits";
      }
      return next;
    });
  }

  function startNewProfile() {
    setActiveProfileId("");
    setDraftProfile(createEmptyProfile());
    setSettingsNotice("正在创建新的 Provider 配置。");
    setSettingsNoticeTone("");
    setView("settings");
  }

  function saveProfile() {
    if (!draftProfile.providerName.trim()) {
      return pushSettingsNotice("请填写 Provider 名称。", "error");
    }
    if (!draftProfile.apiBaseUrl.trim()) {
      return pushSettingsNotice("请填写 API Base URL。", "error");
    }
    if (!draftProfile.apiKey.trim()) {
      return pushSettingsNotice("请填写 API Key。", "error");
    }
    if (!draftProfile.model.trim()) {
      return pushSettingsNotice("请填写 Model。", "error");
    }

    setProfiles((current) => {
      const exists = current.some((profile) => profile.id === draftProfile.id);
      if (exists) {
        return current.map((profile) => (profile.id === draftProfile.id ? draftProfile : profile));
      }
      return [draftProfile, ...current];
    });

    setActiveProfileId(draftProfile.id);
    pushSettingsNotice("配置已保存到浏览器 localStorage。", "success");
  }

  async function testConnection() {
    setIsTesting(true);
    pushSettingsNotice("正在测试连接...");

    try {
      const adapter = createProviderAdapter(draftProfile);
      const message = await adapter.testConnection();
      pushSettingsNotice(message, "success");
    } catch (error) {
      pushSettingsNotice(formatError(error), "error");
    } finally {
      setIsTesting(false);
    }
  }

  function selectProfile(profileId: string) {
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) return;
    setActiveProfileId(profileId);
    setDraftProfile(profile);
    setView("settings");
  }

  function deleteProfile(profileId: string) {
    setProfiles((current) => current.filter((profile) => profile.id !== profileId));
    if (activeProfileId === profileId) {
      setActiveProfileId("");
    }
    pushSettingsNotice("配置已删除。", "success");
  }

  function exportConfig() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      activeProfileId,
      profiles
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "config.json";
    link.click();
    window.URL.revokeObjectURL(url);
    pushSettingsNotice("config.json 已导出。", "success");
  }

  async function importConfig(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        activeProfileId?: string;
        profiles?: ProviderProfile[];
      };

      if (!parsed.profiles?.length) {
        throw new Error("config.json 中没有 profiles。");
      }

      setProfiles(parsed.profiles);
      setActiveProfileId(parsed.activeProfileId || parsed.profiles[0].id);
      pushSettingsNotice("配置已导入。", "success");
    } catch (error) {
      pushSettingsNotice(error instanceof Error ? error.message : "导入失败。", "error");
    } finally {
      event.target.value = "";
    }
  }

  async function addReferenceImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;

    const remaining = Math.max(0, 4 - references.length);
    const picked = files.slice(0, remaining);
    const images = await Promise.all(picked.map(readAsDataUrl));
    setReferences((current) => [...current, ...images].slice(0, 4));
    event.target.value = "";
  }

  function removeReferenceImage(imageId: string) {
    setReferences((current) => current.filter((image) => image.id !== imageId));
  }

  async function generateImage() {
    if (!activeProfile) {
      setView("settings");
      return pushNotice("请先保存一个可用的 Provider 配置。", "error");
    }
    if (!prompt.trim()) {
      return pushNotice("请先输入 Prompt。", "error");
    }

    setIsGenerating(true);
    pushNotice("浏览器正在直接请求你配置的 API...");

    try {
      const adapter = createProviderAdapter(activeProfile);
      const result = await adapter.generate({
        prompt,
        size,
        quality,
        referenceImages: references
      });

      setResultImageUrl(result.imageUrl);
      setResultMeta(`${activeProfile.providerName} · ${activeProfile.model} · ${size} · ${result.responseShape}`);
      pushNotice("生成成功。", "success");

      const item: HistoryItem = {
        id: crypto.randomUUID(),
        prompt,
        imageUrl: result.imageUrl,
        providerName: activeProfile.providerName,
        model: activeProfile.model,
        size,
        createdAt: new Date().toISOString()
      };

      setHistory((current) => [item, ...current].slice(0, 10));
    } catch (error) {
      pushNotice(formatError(error), "error");
    } finally {
      setIsGenerating(false);
    }
  }

  function clearWorkspace() {
    setPrompt("");
    setQuality("high");
    setSize(sizeOptions[0].value);
    setReferences([]);
    pushNotice("");
  }

  function clearHistory() {
    setHistory([]);
  }

  function applyHistoryItem(item: HistoryItem) {
    setPrompt(item.prompt);
    setSize(item.size);
    setResultImageUrl(item.imageUrl);
    setResultMeta(`${item.providerName} · ${item.model} · ${item.size}`);
    setView("generate");
  }

  function pushNotice(message: string, tone: "" | "error" | "success" = "") {
    setNotice(message);
    setNoticeTone(tone);
  }

  function pushSettingsNotice(message: string, tone: "" | "error" | "success" = "") {
    setSettingsNotice(message);
    setSettingsNoticeTone(tone);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-card">
          <div className="brand-mark">
            <Wand2 size={18} />
          </div>
          <div>
            <p className="eyebrow">Vite + React + TS</p>
            <h1>API生图工作站</h1>
          </div>
        </div>

        <div className="sidebar-nav">
          <button className={view === "generate" ? "nav-button active" : "nav-button"} onClick={() => setView("generate")}>
            <Sparkles size={16} />
            生成
          </button>
          <button className={view === "settings" ? "nav-button active" : "nav-button"} onClick={() => setView("settings")}>
            <Settings2 size={16} />
            设置
          </button>
        </div>

        <div className="status-card">
          <span className="card-label">当前 Provider</span>
          <strong>{activeProfile ? activeProfile.providerName : "未配置"}</strong>
          <p>{activeProfile ? `${activeProfile.model} · ${buildUrl(activeProfile.apiBaseUrl, activeProfile.generatePath)}` : "先去设置页填写你的 API 信息。"}</p>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Cloudflare Pages Ready</p>
            <h2>纯静态前端生图控制台</h2>
            <p className="topbar-copy">所有请求都由浏览器直接发送到你自己的 API Base URL，项目不依赖用户系统、数据库或服务端存储。</p>
          </div>
          <div className="topbar-actions">
            <select
              value={activeProfileId || ""}
              onChange={(event) => selectProfile(event.target.value)}
              className="surface-input compact"
            >
              <option value="">{profiles.length ? "选择 Provider" : "未配置 Provider"}</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.providerName}
                </option>
              ))}
            </select>
            <button className="ghost-button" onClick={() => setView("settings")}>
              配置 API
              <ArrowUpRight size={15} />
            </button>
          </div>
        </header>

        {view === "generate" ? (
          <section className="page-grid">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Generate</p>
                  <h3>生成图片</h3>
                </div>
                <button className="ghost-button" onClick={clearWorkspace}>
                  <RefreshCcw size={15} />
                  清空
                </button>
              </div>

              <label className="field">
                <span>Prompt</span>
                <textarea
                  className="surface-input surface-textarea"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="描述主体、风格、材质、构图、光线、镜头感和不想出现的内容。"
                  rows={8}
                />
              </label>

              <div className="field-row">
                <label className="field">
                  <span>分辨率</span>
                  <select className="surface-input" value={size} onChange={(event) => setSize(event.target.value)}>
                    {sizeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} · {option.note}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>质量</span>
                  <select
                    className="surface-input"
                    value={quality}
                    onChange={(event) => setQuality(event.target.value as GenerateImageInput["quality"])}
                  >
                    {qualityOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="field">
                <span>参考图</span>
                <label className="upload-card">
                  <input type="file" accept="image/*" multiple onChange={addReferenceImages} />
                  <ImagePlus size={20} />
                  <strong>上传参考图</strong>
                  <small>最多 4 张。有参考图时会自动使用图片编辑接口。</small>
                </label>
              </div>

              {references.length ? (
                <div className="image-grid">
                  {references.map((image) => (
                    <div key={image.id} className="thumb-card">
                      <img src={image.dataUrl} alt={image.name} />
                      <button className="icon-chip" onClick={() => removeReferenceImage(image.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <button className="primary-button" disabled={isGenerating} onClick={generateImage}>
                {isGenerating ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
                {isGenerating ? "生成中" : "开始生成"}
              </button>

              {notice ? <p className={noticeTone ? `notice ${noticeTone}` : "notice"}>{notice}</p> : null}
            </div>

            <div className="panel result-panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Preview</p>
                  <h3>结果预览</h3>
                </div>
                {resultImageUrl ? (
                  <a className="ghost-button" href={resultImageUrl} download target="_blank" rel="noreferrer">
                    <Download size={15} />
                    下载
                  </a>
                ) : null}
              </div>

              <div className="result-frame">
                {resultImageUrl ? (
                  <img src={resultImageUrl} alt="生成结果" />
                ) : (
                  <div className="result-empty">
                    <Wand2 size={24} />
                    <p>生成结果会显示在这里。</p>
                  </div>
                )}
              </div>

              <p className="result-meta">{resultMeta}</p>
            </div>

            <div className="panel history-panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">History</p>
                  <h3>最近 10 次生成</h3>
                </div>
                <button className="ghost-button" onClick={clearHistory}>
                  <Trash2 size={15} />
                  清空历史
                </button>
              </div>

              <div className="history-list">
                {history.length ? (
                  history.map((item) => (
                    <button key={item.id} className="history-card" onClick={() => applyHistoryItem(item)}>
                      <img src={item.imageUrl} alt="历史图片" />
                      <div>
                        <strong>{item.providerName}</strong>
                        <p>{item.prompt}</p>
                        <span>
                          {item.model} · {item.size} · {formatTime(item.createdAt)}
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="empty-card">还没有历史记录。生成成功后，这里会自动保留最近十次的 Prompt 和图片。</div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="settings-layout">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Settings</p>
                  <h3>Provider 配置</h3>
                </div>
                <button className="ghost-button" onClick={startNewProfile}>
                  <Plus size={15} />
                  新建
                </button>
              </div>

              <div className="field">
                <span>Provider 名称</span>
                <input
                  className="surface-input"
                  value={draftProfile.providerName}
                  onChange={(event) => updateDraftProfile("providerName", event.target.value)}
                  placeholder="例如：OpenAI 主账号 / APINebula image2 / My Flux"
                />
              </div>

              <div className="field">
                <span>接口格式</span>
                <select
                  className="surface-input"
                  value={draftProfile.protocol}
                  onChange={(event) => updateDraftProfile("protocol", event.target.value as ProviderProfile["protocol"])}
                >
                  <option value="openai-compatible">OpenAI 兼容接口</option>
                  <option value="custom">Custom（自定义路径）</option>
                </select>
              </div>

              <div className="field">
                <span>API Base URL</span>
                <input
                  className="surface-input"
                  value={draftProfile.apiBaseUrl}
                  onChange={(event) => updateDraftProfile("apiBaseUrl", event.target.value)}
                  placeholder="例如：https://api.openai.com/v1 或 https://api.example.com"
                />
              </div>

              <div className="field">
                <span>API Key</span>
                <input
                  className="surface-input"
                  type="password"
                  value={draftProfile.apiKey}
                  onChange={(event) => updateDraftProfile("apiKey", event.target.value)}
                  placeholder="输入你自己的 API Key"
                />
              </div>

              <div className="field">
                <span>Model</span>
                <input
                  className="surface-input"
                  value={draftProfile.model}
                  onChange={(event) => updateDraftProfile("model", event.target.value)}
                  placeholder="例如：gpt-image-1 / gpt-image-2 / flux-pro"
                />
              </div>

              <div className="field-row">
                <label className="field">
                  <span>Generate Path</span>
                  <input
                    className="surface-input"
                    value={draftProfile.generatePath}
                    onChange={(event) => updateDraftProfile("generatePath", event.target.value)}
                    placeholder="/images/generations"
                  />
                </label>

                <label className="field">
                  <span>Edit Path</span>
                  <input
                    className="surface-input"
                    value={draftProfile.editPath}
                    onChange={(event) => updateDraftProfile("editPath", event.target.value)}
                    placeholder="/images/edits"
                  />
                </label>
              </div>

              <div className="button-row">
                <button className="ghost-button" disabled={isTesting} onClick={testConnection}>
                  {isTesting ? <Loader2 className="spin" size={15} /> : <ArrowUpRight size={15} />}
                  测试连接
                </button>
                <button className="primary-button compact" onClick={saveProfile}>
                  <Save size={15} />
                  保存配置
                </button>
              </div>

              {settingsNotice ? (
                <p className={settingsNoticeTone ? `notice ${settingsNoticeTone}` : "notice"}>{settingsNotice}</p>
              ) : null}
            </div>

            <div className="panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Profiles</p>
                  <h3>多供应商切换</h3>
                </div>
              </div>

              <div className="button-row button-row-stack">
                <button className="ghost-button" onClick={exportConfig}>
                  <FileDown size={15} />
                  导出 config.json
                </button>
                <label className="ghost-button upload-inline">
                  <Upload size={15} />
                  导入 config.json
                  <input type="file" accept=".json,application/json" onChange={importConfig} />
                </label>
              </div>

              <div className="profile-list">
                {profiles.length ? (
                  profiles.map((profile) => (
                    <div key={profile.id} className={profile.id === activeProfileId ? "profile-card active" : "profile-card"}>
                      <button className="profile-main" onClick={() => selectProfile(profile.id)}>
                        <strong>{profile.providerName}</strong>
                        <p>{profile.model}</p>
                        <span>{buildUrl(profile.apiBaseUrl, profile.generatePath)}</span>
                      </button>
                      <button className="profile-delete" onClick={() => deleteProfile(profile.id)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="empty-card">还没有保存的 Provider。这里会列出你本地浏览器里保存的所有配置。</div>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

async function readAsDataUrl(file: File): Promise<ReferenceImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取图片失败。"));
    reader.readAsDataURL(file);
  });

  return {
    id: crypto.randomUUID(),
    name: file.name,
    dataUrl
  };
}

function loadProfiles(): ProviderProfile[] {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEYS.profiles) || "[]");
  } catch {
    return [];
  }
}

function loadActiveProfileId() {
  try {
    return window.localStorage.getItem(STORAGE_KEYS.activeProfileId) || "";
  } catch {
    return "";
  }
}

function loadHistory(): HistoryItem[] {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEYS.history) || "[]");
  } catch {
    return [];
  }
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatError(error: unknown) {
  if (error instanceof ApiError && error.detail) {
    return `${error.message}：${error.detail}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败。";
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
