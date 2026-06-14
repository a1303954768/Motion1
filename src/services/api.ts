export type ProviderProtocol = "openai-compatible" | "custom";

export type ProviderProfile = {
  id: string;
  providerName: string;
  protocol: ProviderProtocol;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  generatePath: string;
  editPath: string;
};

export type GenerateImageInput = {
  prompt: string;
  size: string;
  quality: "auto" | "high" | "low" | "medium";
  referenceImages: { dataUrl: string; name: string }[];
};

export type GenerateImageResult = {
  imageUrl: string;
  responseShape: string;
};

export class ApiError extends Error {
  detail?: string;

  constructor(message: string, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.detail = detail;
  }
}

export class ProviderAdapter {
  constructor(protected profile: ProviderProfile) {}

  async testConnection(): Promise<string> {
    throw new ApiError("ProviderAdapter 未实现 testConnection。");
  }

  async generate(_input: GenerateImageInput): Promise<GenerateImageResult> {
    throw new ApiError("ProviderAdapter 未实现 generate。");
  }
}

class OpenAICompatibleProvider extends ProviderAdapter {
  async testConnection(): Promise<string> {
    validateProfile(this.profile);

    const modelsUrl = buildUrl(this.profile.apiBaseUrl, "/models");
    try {
      const response = await fetch(modelsUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.profile.apiKey}`
        }
      });

      if (response.status === 404 || response.status === 405) {
        return "连接成功，当前供应商未暴露 /models，但基础地址可用。";
      }

      const json = await parseJson(response);
      const count = Array.isArray(json?.data) ? json.data.length : 0;
      return count ? `连接成功，读取到 ${count} 个模型。` : "连接成功。";
    } catch (error) {
      throw normalizeError(error);
    }
  }

  async generate(input: GenerateImageInput): Promise<GenerateImageResult> {
    validateProfile(this.profile);
    if (!input.prompt.trim()) {
      throw new ApiError("请输入 Prompt。");
    }

    try {
      if (input.referenceImages.length) {
        return await this.editImage(input);
      }
      return await this.generateImage(input);
    } catch (error) {
      throw normalizeError(error);
    }
  }

  private async generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
    const response = await fetch(buildUrl(this.profile.apiBaseUrl, this.profile.generatePath), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.profile.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.profile.model,
        prompt: input.prompt,
        size: input.size,
        quality: input.quality,
        n: 1,
        response_format: "url"
      })
    });

    const json = await parseJson(response);
    return {
      imageUrl: extractImageUrl(json),
      responseShape: describeShape(json)
    };
  }

  private async editImage(input: GenerateImageInput): Promise<GenerateImageResult> {
    const form = new FormData();
    form.append("model", this.profile.model);
    form.append("prompt", input.prompt);
    form.append("size", input.size);
    form.append("quality", input.quality);
    form.append("response_format", "url");
    form.append("input_fidelity", "high");

    for (const image of input.referenceImages.slice(0, 4)) {
      form.append("image", dataUrlToBlob(image.dataUrl), image.name || "reference.png");
    }

    const response = await fetch(buildUrl(this.profile.apiBaseUrl, this.profile.editPath), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.profile.apiKey}`
      },
      body: form
    });

    const json = await parseJson(response);
    return {
      imageUrl: extractImageUrl(json),
      responseShape: describeShape(json)
    };
  }
}

class CustomProvider extends OpenAICompatibleProvider {}

export function createProviderAdapter(profile: ProviderProfile): ProviderAdapter {
  if (profile.protocol === "custom") {
    return new CustomProvider(profile);
  }
  return new OpenAICompatibleProvider(profile);
}

export function createEmptyProfile(): ProviderProfile {
  return {
    id: crypto.randomUUID(),
    providerName: "",
    protocol: "openai-compatible",
    apiBaseUrl: "",
    apiKey: "",
    model: "",
    generatePath: "/images/generations",
    editPath: "/images/edits"
  };
}

export function validateProfile(profile: ProviderProfile) {
  if (!profile.providerName.trim()) {
    throw new ApiError("请填写 Provider 名称。");
  }
  if (!profile.apiBaseUrl.trim()) {
    throw new ApiError("请填写 API Base URL。");
  }
  if (!profile.apiKey.trim()) {
    throw new ApiError("请填写 API Key。");
  }
  if (!profile.model.trim()) {
    throw new ApiError("请填写 Model。");
  }
}

export function buildUrl(baseUrl: string, path: string) {
  const cleanedBase = baseUrl.trim().replace(/\/+$/, "");
  if (/\/images\/(generations|edits)$/i.test(cleanedBase)) {
    return cleanedBase;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (/\/v1$/i.test(cleanedBase)) {
    return `${cleanedBase}${normalizedPath}`;
  }

  return `${cleanedBase}/v1${normalizedPath}`;
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  let json: Record<string, unknown> = {};

  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new ApiError("接口返回的不是 JSON。", text.slice(0, 500));
  }

  if (!response.ok) {
    const detail =
      readMessage(json) ||
      text.slice(0, 500) ||
      `HTTP ${response.status}`;
    throw new ApiError(`接口请求失败（HTTP ${response.status}）`, detail);
  }

  return json;
}

function readMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const error = record.error as Record<string, unknown> | undefined;
  return String(error?.message || record.message || record.msg || record.detail || "");
}

function describeShape(payload: unknown) {
  if (!payload || typeof payload !== "object") return "unknown";
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.data)) {
    return `data[${record.data.length}]`;
  }
  return Object.keys(record).slice(0, 8).join(", ");
}

function extractImageUrl(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new ApiError("接口已返回，但图片字段不可识别。");
  }

  const record = payload as Record<string, unknown>;
  const first = Array.isArray(record.data) ? (record.data[0] as Record<string, unknown> | undefined) : undefined;
  const candidates = [
    first?.url,
    first?.image_url,
    first?.b64_json,
    first?.base64,
    record.url,
    record.image_url,
    record.image,
    (record.output as Record<string, unknown>[] | undefined)?.[0]?.url,
    (record.output as Record<string, unknown>[] | undefined)?.[0]?.b64_json
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    if (candidate.startsWith("data:image/")) return candidate;
    if (/^https?:\/\//.test(candidate)) return candidate;
    if (/^[A-Za-z0-9+/=]{1000,}$/.test(candidate)) return `data:image/png;base64,${candidate}`;
  }

  throw new ApiError("接口已返回，但没有找到可显示的图片地址。", JSON.stringify(payload).slice(0, 500));
}

function dataUrlToBlob(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new ApiError("参考图格式无法识别。");
  }

  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: match[1] });
}

function normalizeError(error: unknown) {
  if (error instanceof ApiError) return error;
  if (error instanceof Error && error.message.includes("Failed to fetch")) {
    return new ApiError(
      "浏览器请求失败",
      "供应商可能未开放 CORS，或 API Base URL 无法直接被浏览器访问。"
    );
  }
  if (error instanceof Error) {
    return new ApiError(error.message);
  }
  return new ApiError("请求失败。");
}
