/**
 * Google Drive & Identity Services Helper
 */

export interface GoogleUser {
  accessToken: string;
  name: string;
  email: string;
  picture: string;
}


export class GoogleDriveService {
  private clientId: string;
  private clientSecret: string;
  private accessToken: string = "";
  private user: GoogleUser | null = null;

  constructor(clientId: string, clientSecret: string = "") {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  // PKCE Helpers
  private async generateCodeVerifier(): Promise<string> {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error("Crypto Subtle API is not available. Please ensure you are using HTTPS or localhost.");
    }

    try {
      const digest = await window.crypto.subtle.digest('SHA-256', data);
      return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    } catch (e) {
      console.error("Crypto digest failed:", e);
      throw new Error("Failed to generate code challenge: " + (e as any).message);
    }
  }

  async login(): Promise<void> {
    const redirectUri = window.location.origin + window.location.pathname;
    const scopes = [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/documents.readonly",
      "openid",
      "profile",
      "email"
    ];

    // Generate and store PKCE verifier in localStorage for better persistence
    const verifier = await this.generateCodeVerifier();
    localStorage.setItem('g_pkce_verifier', verifier);
    const challenge = await this.generateCodeChallenge(verifier);

    const responseType = "code";
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
      `client_id=${this.clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=${responseType}&` +
      `scope=${encodeURIComponent(scopes.join(" "))}&` +
      `code_challenge=${challenge}&` +
      `code_challenge_method=S256&` +
      `access_type=offline&` +
      `prompt=consent`;

    console.log(`[Auth] Initiating PKCE Auth Flow (with Client Secret capability)`);
    window.location.assign(authUrl);
  }

  // --- Token Refresh ---

  async tryRefresh(): Promise<GoogleUser | null> {
    const refreshToken = localStorage.getItem('g_refresh_token');
    if (!refreshToken) return null;

    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token"
        })
      });

      const data = await response.json();
      if (data.access_token) {
        this.accessToken = data.access_token;
        return await this.loadProfile();
      } else {
        console.warn("Refresh failed:", data);
        localStorage.removeItem('g_refresh_token');
        return null;
      }
    } catch (err) {
      console.error("Refresh error:", err);
      return null;
    }
  }

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  // Static lock to prevent parallel execution during React StrictMode double-mounts
  private static isHandlingCallback = false;

  async handleCallback(): Promise<GoogleUser | null> {
    const hash = window.location.hash;
    const search = window.location.search;
    const params = new URLSearchParams(search);
    const code = params.get("code");

    // 1. Handle Code (Authorization Code Flow with PKCE)
    if (code) {
      // CRITICAL: Cleanup URL immediately to stop React StrictMode/Effects from looping
      window.history.replaceState(null, "", window.location.pathname);

      if (GoogleDriveService.isHandlingCallback) {
        console.warn("[Auth] Callback already in progress, skipping duplicate call.");
        return null; 
      }

      const verifier = localStorage.getItem('g_pkce_verifier');
      if (!verifier) {
        if (this.user) return this.user;
        console.warn("[Auth] No PKCE verifier found. (Already consumed or session lost)");
        return null;
      }

      console.log(`[Auth] Exchanging code for token using CID: ${this.clientId.substring(0, 10)}... (PKCE + Secret Mode)`);
      GoogleDriveService.isHandlingCallback = true;
      try {
        const redirectUri = window.location.origin + window.location.pathname;
        const bodyParams: Record<string, string> = {
          client_id: this.clientId,
          code: code,
          code_verifier: verifier,
          grant_type: "authorization_code",
          redirect_uri: redirectUri
        };

        // If clientSecret is present, Google Web Application CID requires it
        if (this.clientSecret) {
          bodyParams.client_secret = this.clientSecret;
        }

        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(bodyParams)
        });

        const data = await res.json();
        localStorage.removeItem('g_pkce_verifier');

        if (data.error) {
          console.error("[Auth] Token exchange error:", data.error, data.error_description);
          return null;
        }
        
        if (data.access_token) {
          this.accessToken = data.access_token;
          if (data.refresh_token) {
            localStorage.setItem('g_refresh_token', data.refresh_token);
          }
          return await this.loadProfile();
        }
      } catch (err) {
        console.error("Token exchange failed", err);
      } finally {
        GoogleDriveService.isHandlingCallback = false;
      }
    }

    // 2. Handle Token (Legacy fallback)
    if (hash.includes("access_token=")) {
      const hashParams = new URLSearchParams(hash.substring(1));
      const token = hashParams.get("access_token") || "";
      window.history.replaceState(null, "", window.location.pathname);
      this.accessToken = token;
      return await this.loadProfile();
    }

    return await this.tryRefresh();
  }

  private async loadProfile(): Promise<GoogleUser | null> {
    if (!this.accessToken) return null;
    try {
      const profile = await this.getProfile(this.accessToken);
      if (profile.error) {
        this.accessToken = "";
        return null;
      }
      this.user = {
        accessToken: this.accessToken,
        name: profile.name || profile.given_name || "User",
        email: profile.email || "",
        picture: profile.picture || "",
      };
      return this.user;
    } catch (err) {
      console.error("Failed to load profile", err);
      return null;
    }
  }

  private async getProfile(token: string) {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  }

  private async _fetch(url: string, options: any = {}): Promise<Response> {
    if (!this.accessToken) {
      // Try refresh one last time
      const user = await this.tryRefresh();
      if (!user) {
        console.warn("No access token available for request:", url);
        throw new Error("AUTH_EXPIRED");
      }
    }

    const headers: Record<string, string> = {
      ...options.headers,
      'Authorization': `Bearer ${this.accessToken}`,
    };

    try {
      const res = await fetch(url, {
        ...options,
        headers
      });

      if (res.status === 401) {
        console.warn("401 Unauthorized - Attempting refresh");
        const user = await this.tryRefresh();
        if (user) {
          // Retry once
          const retryHeaders = { ...headers, 'Authorization': `Bearer ${this.accessToken}` };
          return await fetch(url, { ...options, headers: retryHeaders });
        }
        this.accessToken = "";
        throw new Error("AUTH_EXPIRED");
      }

      return res;
    } catch (err: any) {
      if (err.message === "AUTH_EXPIRED") throw err;
      console.error(`Fetch failure for ${url}:`, err);
      if (err instanceof TypeError) {
        console.error("Network error - check CORS/Adblock");
      }
      throw err;
    }
  }

  async listFiles(folderId: string) {
    let allFiles: any[] = [];
    let pageToken: string | null = null;
    const query = `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.document' and trashed = false`;

    do {
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,mimeType)&orderBy=name&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ""}`;
      const res = await this._fetch(url);
      const data = await res.json();

      if (data.files) {
        allFiles = allFiles.concat(data.files);
      }
      pageToken = data.nextPageToken || null;
    } while (pageToken);

    return allFiles;
  }

  async getDocContent(fileId: string): Promise<string> {
    try {
      const res = await this._fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`);

      if (!res.ok) {
        const error = await res.text();
        console.error("Export failed:", error);
        return `Export Error: ${res.status}`;
      }

      return await res.text();
    } catch (err: any) {
      if (err.message === "AUTH_EXPIRED") {
        return "AUTH_EXPIRED";
      }
      console.error("Failed to fetch doc content:", err);
      return "Network Error";
    }
  }

  async findFileByName(name: string): Promise<string | null> {
    const query = `name = '${name}' and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;
    const res = await this._fetch(url);
    const data = await res.json();
    return data.files && data.files.length > 0 ? data.files[0].id : null;
  }

  async saveFile(name: string, content: string): Promise<void> {
    const existingId = await this.findFileByName(name);
    const metadata = { name, mimeType: 'text/plain' };

    if (existingId) {
      // Update existing
      await this._fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: content,
      });
    } else {
      // Create new
      const boundary = 'even_hub_boundary';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const multipartBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: text/plain\r\n\r\n' +
        content +
        closeDelimiter;

      const res = await this._fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      });

      if (!res.ok) {
        const err = await res.text();
        console.error("Save failed:", err);
      }
    }
  }

  async readFile(fileId: string): Promise<string> {
    const res = await this._fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    return await res.text();
  }

  getUser() {
    return this.user;
  }
}
