import axios, { AxiosInstance } from "axios";
import https from "node:https";
import { ConfluenceConfig, JiraConfig } from "./config.js";

export function createConfluenceClient(config: ConfluenceConfig): AxiosInstance {
  const agent = new https.Agent({
    rejectUnauthorized: !config.ignoreTlsErrors,
  });

  const token = Buffer.from(`${config.email}:${config.apiToken}`).toString(
    "base64"
  );

  const client = axios.create({
    baseURL: config.baseUrl,
    httpsAgent: agent,
    headers: {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    timeout: 30000,
  });

  return client;
}

export function createJiraClient(config: JiraConfig): AxiosInstance {
  const agent = new https.Agent({
    rejectUnauthorized: !config.ignoreTlsErrors,
  });

  const token = Buffer.from(`${config.email}:${config.apiToken}`).toString(
    "base64"
  );

  const client = axios.create({
    baseURL: config.baseUrl,
    httpsAgent: agent,
    headers: {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    timeout: 30000,
  });

  return client;
}