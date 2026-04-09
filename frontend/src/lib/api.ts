import axios, { type AxiosRequestConfig, type Method } from 'axios';
import { getAPIBaseURL } from './config';

type InvokeOptions = {
  url?: string;
  path?: string;
  method?: string;
  data?: unknown;
  body?: unknown;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
};

const SESSION_ROUTE_PREFIX = '/api/v1/interview/sessions';
const ENTITY_SESSION_ROUTE_PREFIX = '/api/v1/entities/interview_sessions';

function normalizeUrl(rawUrl: string): string {
  if (rawUrl.startsWith(SESSION_ROUTE_PREFIX)) {
    return rawUrl.replace(SESSION_ROUTE_PREFIX, ENTITY_SESSION_ROUTE_PREFIX);
  }
  return rawUrl;
}

function buildUrl(rawUrl: string): string {
  if (/^https?:\/\//.test(rawUrl)) {
    return rawUrl;
  }

  const normalizedBase = getAPIBaseURL().replace(/\/$/, '');
  const normalizedPath = normalizeUrl(rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`);
  return `${normalizedBase}${normalizedPath}`;
}

async function invoke(options: InvokeOptions) {
  const target = options.url ?? options.path;
  if (!target) {
    throw new Error('API url is required');
  }

  const config: AxiosRequestConfig = {
    url: buildUrl(target),
    method: (options.method ?? 'GET') as Method,
    data: options.data ?? options.body,
    headers: options.headers,
    params: options.params,
    withCredentials: true,
  };

  return axios.request(config);
}

export const client = {
  apiCall: {
    invoke,
  },
  auth: {
    login() {
      window.location.href = `${getAPIBaseURL().replace(/\/$/, '')}/api/v1/auth/login`;
    },
  },
};
