import { promises as fs } from "node:fs";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { aiProviderCatalog, getAiProviderDefinition, isAiProviderId, type AiProviderId } from "./ai-providers";
import type {
  GuideStep,
  PublicGuideRule,
  PublicKnowledgeDocument,
  PublicWidgetConfig
} from "./guide-types";

type StoredProject = {
  id: string;
  publicId: string;
  name: string;
  domain: string | null;
  theme: {
    accent: string;
    robotBaseUrl: string;
    robotAssetFormat?: "png" | "svg";
    logoText?: string;
  };
  activeAiProvider?: AiProviderId | null;
  createdAt: string;
  updatedAt: string;
};

type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

type StoredGuide = PublicGuideRule & {
  id: string;
  projectId: string;
  enabled: boolean;
  steps: GuideStep[];
  createdAt: string;
  updatedAt: string;
};

type StoredEvent = {
  id: string;
  projectId: string;
  type: string;
  guideSlug?: string;
  stepIndex?: number;
  path?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

type StoredDocument = PublicKnowledgeDocument & {
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

type StoredAiProviderCredential = {
  id: string;
  projectId: string;
  provider: AiProviderId;
  encryptedApiKey: string;
  keyHint: string;
  model: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type StoreData = {
  users: StoredUser[];
  projects: StoredProject[];
  guides: StoredGuide[];
  documents: StoredDocument[];
  events: StoredEvent[];
  aiProviders: StoredAiProviderCredential[];
};

const seedStorePath = path.join(process.cwd(), "data", "store.json");
const localStorePath = path.join(process.cwd(), "data", "store.local.json");

async function readStore(): Promise<StoreData> {
  try {
    const raw = await fs.readFile(localStorePath, "utf8");
    return normalizeStore(JSON.parse(raw) as StoreData);
  } catch {
    const raw = await fs.readFile(seedStorePath, "utf8");
    const data = normalizeStore(JSON.parse(raw) as StoreData);
    await writeStore(data);
    return data;
  }
}

function normalizeStore(data: StoreData): StoreData {
  return {
    ...data,
    users: data.users ?? [],
    guides: data.guides ?? [],
    documents: data.documents ?? [],
    events: data.events ?? [],
    aiProviders: data.aiProviders ?? []
  };
}

async function writeStore(data: StoreData) {
  await fs.mkdir(path.dirname(localStorePath), { recursive: true });
  await fs.writeFile(localStorePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function resetLocalStore() {
  const raw = await fs.readFile(seedStorePath, "utf8");
  const data = JSON.parse(raw) as StoreData;
  await writeStore(data);
  return data;
}

export async function resetProjectToSeed(session?: { projectId?: string | null }) {
  const data = await readStore();
  const project = findSessionProject(data, session);

  if (!project) {
    return null;
  }

  const rawSeed = await fs.readFile(seedStorePath, "utf8");
  const seedData = normalizeStore(JSON.parse(rawSeed) as StoreData);
  const seedProject = seedData.projects.find((item) => item.publicId === project.publicId);

  if (!seedProject) {
    return null;
  }

  const now = new Date().toISOString();
  const resetProject: StoredProject = {
    ...seedProject,
    id: project.id,
    publicId: project.publicId,
    createdAt: project.createdAt ?? seedProject.createdAt,
    updatedAt: now
  };

  data.projects = data.projects.map((item) => (item.id === project.id ? resetProject : item));
  data.guides = [
    ...data.guides.filter((guide) => guide.projectId !== project.id),
    ...seedData.guides
      .filter((guide) => guide.projectId === seedProject.id)
      .map((guide) => ({ ...guide, projectId: project.id, updatedAt: now }))
  ];
  data.documents = [
    ...data.documents.filter((document) => document.projectId !== project.id),
    ...seedData.documents
      .filter((document) => document.projectId === seedProject.id)
      .map((document) => ({ ...document, projectId: project.id, updatedAt: now }))
  ];
  data.events = data.events.filter((event) => event.projectId !== project.id);
  data.aiProviders = data.aiProviders.filter((provider) => provider.projectId !== project.id);

  await writeStore(data);
  return adminProjectPayload(data, resetProject);
}

function publicGuide(guide: StoredGuide): PublicGuideRule {
  return {
    slug: guide.slug,
    title: guide.title,
    intent: guide.intent,
    aliases: guide.aliases,
    urlPattern: guide.urlPattern,
    steps: guide.steps
  };
}

function publicDocument(document: StoredDocument): PublicKnowledgeDocument {
  return {
    id: document.id,
    title: document.title,
    content: document.content,
    tags: document.tags,
    enabled: document.enabled
  };
}

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function defaultTheme() {
  return {
    accent: "#2563eb",
    robotBaseUrl: "/robot",
    robotAssetFormat: "png" as const,
    logoText: "smartup"
  };
}

function tokenSecret() {
  const secret = (
    process.env.AI_TOKEN_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    ""
  ).trim();

  if (secret) {
    return createHash("sha256").update(secret).digest();
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("AI_TOKEN_SECRET, ADMIN_SESSION_SECRET, AUTH_SECRET, or NEXTAUTH_SECRET must be configured in production.");
  }

  return createHash("sha256").update("local-development-smartup-ai-token-secret").digest();
}

function encryptApiKey(apiKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptApiKey(encryptedApiKey: string) {
  if (!encryptedApiKey) return null;

  try {
    const [version, iv, tag, encrypted] = encryptedApiKey.split(":");
    if (version !== "v1" || !iv || !tag || !encrypted) return null;
    const decipher = createDecipheriv("aes-256-gcm", tokenSecret(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    return null;
  }
}

function maskApiKey(apiKey: string) {
  const clean = apiKey.trim();
  if (!clean) return "";
  if (clean.length <= 8) return "••••";
  return `${clean.slice(0, 4)}••••${clean.slice(-4)}`;
}

function publicIdFromEmail(email: string, existingPublicIds: Set<string>) {
  const base =
    email
      .split("@")[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "project";
  let publicId = base;
  let suffix = 1;

  while (existingPublicIds.has(publicId)) {
    suffix += 1;
    publicId = `${base}-${suffix}`;
  }

  return publicId;
}

function adminProjectPayload(data: StoreData, project: StoredProject) {
  return {
    id: project.id,
    publicId: project.publicId,
    name: project.name,
    domain: project.domain,
    theme: project.theme,
    guides: data.guides.filter((guide) => guide.projectId === project.id).map(publicGuide),
    documents: data.documents.filter((document) => document.projectId === project.id).map(publicDocument),
    events: data.events
      .filter((event) => event.projectId === project.id)
      .slice()
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 20)
  };
}

function findSessionProject(data: StoreData, session?: { projectId?: string | null }) {
  if (session?.projectId) {
    return data.projects.find((project) => project.id === session.projectId) ?? null;
  }

  return data.projects[0] ?? null;
}

export async function getUserByEmail(email: string) {
  const data = await readStore();
  const normalizedEmail = email.trim().toLowerCase();
  const user = data.users.find((item) => item.email === normalizedEmail);

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    projectId: user.projectId
  };
}

export async function createUserWithProject(input: {
  email: string;
  passwordHash: string;
  projectName?: string;
}) {
  const data = await readStore();
  const normalizedEmail = input.email.trim().toLowerCase();

  if (data.users.some((user) => user.email === normalizedEmail)) {
    return null;
  }

  const now = new Date().toISOString();
  const projectId = createId("project");
  const project: StoredProject = {
    id: projectId,
    publicId: publicIdFromEmail(normalizedEmail, new Set(data.projects.map((item) => item.publicId))),
    name: input.projectName?.trim() || `${normalizedEmail.split("@")[0] || "My"} Guide`,
    domain: null,
    theme: defaultTheme(),
    activeAiProvider: null,
    createdAt: now,
    updatedAt: now
  };
  const user: StoredUser = {
    id: createId("user"),
    email: normalizedEmail,
    passwordHash: input.passwordHash,
    projectId,
    createdAt: now,
    updatedAt: now
  };

  data.projects.push(project);
  data.users.push(user);
  await writeStore(data);

  return {
    id: user.id,
    email: user.email,
    projectId: user.projectId
  };
}

export async function getPublicWidgetConfig(publicId: string): Promise<PublicWidgetConfig | null> {
  const data = await readStore();
  const project = data.projects.find((item) => item.publicId === publicId);

  if (!project) {
    return null;
  }

  return {
    projectId: project.publicId,
    projectName: project.name,
    domain: project.domain,
    theme: project.theme,
    guides: data.guides
      .filter((guide) => guide.projectId === project.id && guide.enabled)
      .map(publicGuide)
  };
}

export async function getKnowledgeDocuments(publicId: string) {
  const data = await readStore();
  const project = data.projects.find((item) => item.publicId === publicId);

  if (!project) {
    return null;
  }

  return data.documents
    .filter((document) => document.projectId === project.id && document.enabled)
    .map(publicDocument);
}

export async function getAdminProject(session?: { projectId?: string | null }) {
  const data = await readStore();
  const project = findSessionProject(data, session);

  if (!project) {
    return null;
  }

  return adminProjectPayload(data, project);
}

export async function updateProject(
  publicId: string,
  input: {
    name?: string;
    domain?: string | null;
    theme?: {
      accent?: string;
      logoText?: string;
    };
  }
) {
  const data = await readStore();
  const project = data.projects.find((item) => item.publicId === publicId);

  if (!project) {
    return null;
  }

  project.name = input.name ?? project.name;
  project.domain = input.domain !== undefined ? input.domain : project.domain;
  project.theme = {
    ...project.theme,
    accent: input.theme?.accent ?? project.theme.accent,
    logoText: input.theme?.logoText ?? project.theme.logoText
  };
  project.updatedAt = new Date().toISOString();

  await writeStore(data);
  return adminProjectPayload(data, project);
}

function publicAiProvider(
  project: StoredProject,
  credential?: StoredAiProviderCredential
) {
  const definition = getAiProviderDefinition(credential?.provider ?? "");

  if (!definition || !credential) {
    return null;
  }

  const hasToken = Boolean(credential.encryptedApiKey);

  return {
    provider: credential.provider,
    name: definition.name,
    shortName: definition.shortName,
    description: definition.description,
    defaultModel: definition.defaultModel,
    model: credential.model || definition.defaultModel,
    enabled: credential.enabled && hasToken,
    hasToken,
    keyHint: credential.keyHint || null,
    active: project.activeAiProvider === credential.provider,
    baseUrl: definition.baseUrl,
    protocol: definition.protocol
  };
}

export async function getAiProviderConnections(session?: { projectId?: string | null }) {
  const data = await readStore();
  const project = findSessionProject(data, session);

  if (!project) {
    return null;
  }

  return {
    activeProvider: project.activeAiProvider ?? null,
    providers: aiProviderCatalog.map((definition) => {
      const credential = data.aiProviders.find(
        (item) => item.projectId === project.id && item.provider === definition.id
      );
      const publicCredential = publicAiProvider(project, credential);

      return (
        publicCredential ?? {
          provider: definition.id,
          name: definition.name,
          shortName: definition.shortName,
          description: definition.description,
          defaultModel: definition.defaultModel,
          model: definition.defaultModel,
          enabled: false,
          hasToken: false,
          keyHint: null,
          active: false,
          baseUrl: definition.baseUrl,
          protocol: definition.protocol
        }
      );
    })
  };
}

export async function upsertAiProviderConnection(
  session: { projectId?: string | null },
  input: {
    provider: AiProviderId;
    apiKey?: string;
    model?: string;
    enabled?: boolean;
    makeActive?: boolean;
  }
) {
  const data = await readStore();
  const project = findSessionProject(data, session);
  const definition = getAiProviderDefinition(input.provider);

  if (!project || !definition) {
    return null;
  }

  const now = new Date().toISOString();
  const existingIndex = data.aiProviders.findIndex(
    (item) => item.projectId === project.id && item.provider === input.provider
  );
  const existing = existingIndex >= 0 ? data.aiProviders[existingIndex] : null;
  const cleanApiKey = input.apiKey?.trim();
  const encryptedApiKey = cleanApiKey ? encryptApiKey(cleanApiKey) : existing?.encryptedApiKey ?? "";
  const hasToken = Boolean(encryptedApiKey);
  const credential: StoredAiProviderCredential = {
    id: existing?.id ?? createId("provider"),
    projectId: project.id,
    provider: input.provider,
    encryptedApiKey,
    keyHint: cleanApiKey ? maskApiKey(cleanApiKey) : existing?.keyHint ?? "",
    model: input.model?.trim() || existing?.model || definition.defaultModel,
    enabled: hasToken ? input.enabled ?? existing?.enabled ?? true : false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  if (existingIndex >= 0) {
    data.aiProviders[existingIndex] = credential;
  } else {
    data.aiProviders.push(credential);
  }

  if (input.makeActive && credential.enabled && credential.encryptedApiKey) {
    project.activeAiProvider = input.provider;
  }

  project.updatedAt = now;
  await writeStore(data);

  return getAiProviderConnections(session);
}

export async function setActiveAiProvider(session: { projectId?: string | null }, provider: AiProviderId | "rules") {
  const data = await readStore();
  const project = findSessionProject(data, session);

  if (!project) {
    return null;
  }

  if (provider === "rules") {
    project.activeAiProvider = null;
    project.updatedAt = new Date().toISOString();
    await writeStore(data);
    return getAiProviderConnections(session);
  }

  if (!isAiProviderId(provider)) {
    return null;
  }

  const credential = data.aiProviders.find((item) => item.projectId === project.id && item.provider === provider);
  if (!credential?.enabled || !credential.encryptedApiKey) {
    return null;
  }

  project.activeAiProvider = provider;
  project.updatedAt = new Date().toISOString();
  await writeStore(data);

  return getAiProviderConnections(session);
}

export async function getProjectAiRuntimeProvider(publicId?: string) {
  if (!publicId) {
    return null;
  }

  const data = await readStore();
  const project = data.projects.find((item) => item.publicId === publicId);
  const activeProvider = project?.activeAiProvider;

  if (!project || !activeProvider) {
    return null;
  }

  const definition = getAiProviderDefinition(activeProvider);
  const credential = data.aiProviders.find(
    (item) => item.projectId === project.id && item.provider === activeProvider
  );
  const apiKey = credential?.enabled ? decryptApiKey(credential.encryptedApiKey) : null;

  if (!definition || !credential || !apiKey) {
    return null;
  }

  return {
    provider: activeProvider,
    apiKey,
    model: credential.model || definition.defaultModel,
    baseUrl: definition.baseUrl,
    protocol: definition.protocol
  };
}

export async function upsertDocument(
  input: Omit<PublicKnowledgeDocument, "id"> & { id?: string; projectPublicId: string }
) {
  const data = await readStore();
  const project = data.projects.find((item) => item.publicId === input.projectPublicId);

  if (!project) {
    return null;
  }

  const now = new Date().toISOString();
  const existingIndex = input.id
    ? data.documents.findIndex((document) => document.projectId === project.id && document.id === input.id)
    : -1;

  const nextDocument: StoredDocument = {
    id: existingIndex >= 0 ? data.documents[existingIndex].id : createId("doc"),
    projectId: project.id,
    title: input.title,
    content: input.content,
    tags: input.tags,
    enabled: input.enabled,
    createdAt: existingIndex >= 0 ? data.documents[existingIndex].createdAt : now,
    updatedAt: now
  };

  if (existingIndex >= 0) {
    data.documents[existingIndex] = nextDocument;
  } else {
    data.documents.push(nextDocument);
  }

  project.updatedAt = now;
  await writeStore(data);
  return publicDocument(nextDocument);
}

export async function upsertGuide(input: PublicGuideRule & { projectPublicId: string }) {
  const data = await readStore();
  const project = data.projects.find((item) => item.publicId === input.projectPublicId);

  if (!project) {
    return null;
  }

  const now = new Date().toISOString();
  const existingIndex = data.guides.findIndex(
    (guide) => guide.projectId === project.id && guide.slug === input.slug
  );

  const nextGuide: StoredGuide = {
    id: existingIndex >= 0 ? data.guides[existingIndex].id : createId("guide"),
    projectId: project.id,
    slug: input.slug,
    title: input.title,
    intent: input.intent,
    aliases: input.aliases,
    urlPattern: input.urlPattern,
    enabled: true,
    steps: input.steps,
    createdAt: existingIndex >= 0 ? data.guides[existingIndex].createdAt : now,
    updatedAt: now
  };

  if (existingIndex >= 0) {
    data.guides[existingIndex] = nextGuide;
  } else {
    data.guides.push(nextGuide);
  }

  project.updatedAt = now;
  await writeStore(data);
  return publicGuide(nextGuide);
}

export async function addEvent(input: {
  projectPublicId: string;
  type: string;
  guideSlug?: string;
  stepIndex?: number;
  path?: string;
  metadata?: Record<string, unknown>;
}) {
  const data = await readStore();
  const project = data.projects.find((item) => item.publicId === input.projectPublicId);

  if (!project) {
    return false;
  }

  data.events.unshift({
    id: createId("event"),
    projectId: project.id,
    type: input.type,
    guideSlug: input.guideSlug,
    stepIndex: input.stepIndex,
    path: input.path,
    metadata: input.metadata,
    createdAt: new Date().toISOString()
  });

  data.events = data.events.slice(0, 200);
  await writeStore(data);
  return true;
}
