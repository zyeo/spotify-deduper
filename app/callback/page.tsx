"use client";

import { useEffect, useRef, useState } from "react";

type Status = "loading" | "success" | "error";

export default function CallbackPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Finishing Spotify login...");
  const hasRunRef = useRef(false);

  useEffect(() => {
    async function finishLogin() {
      try {
        const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
        const redirectUri = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI;
        const params = new URLSearchParams(window.location.search);

        const code = params.get("code");
        const returnedState = params.get("state");
        const spotifyError = params.get("error");
        const codeVerifier = sessionStorage.getItem("spotify_code_verifier");
        const storedState = sessionStorage.getItem("spotify_auth_state");
        const statesMatch = returnedState === storedState;

        console.log("callback started");
        console.log("code exists", Boolean(code));
        console.log("state exists", Boolean(returnedState));
        console.log("verifier exists", Boolean(codeVerifier));
        console.log("stored state exists", Boolean(storedState));
        console.log("state match result", statesMatch);

        if (!clientId || !redirectUri) {
          throw new Error("Missing Spotify environment variables.");
        }

        if (spotifyError) {
          throw new Error(`Spotify returned an error: ${spotifyError}`);
        }

        if (!code || !returnedState) {
          throw new Error("Missing code or state in the callback URL.");
        }

        if (!codeVerifier || !storedState) {
          throw new Error("Missing saved PKCE values in sessionStorage.");
        }

        if (!statesMatch) {
          throw new Error("State mismatch. The login response could not be verified.");
        }

        const response = await fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: clientId,
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
          }),
        });

        console.log("token response status", response.status);

        const responseText = await response.text();
        let data: unknown = null;

        try {
          data = responseText ? JSON.parse(responseText) : null;
        } catch {
          data = responseText;
        }

        if (!response.ok) {
          const errorMessage =
            data && typeof data === "object" && "error_description" in data
              ? String(data.error_description)
              : responseText || "Unable to exchange code for tokens.";

          throw new Error(errorMessage);
        }

        if (!data || typeof data !== "object" || !("access_token" in data)) {
          throw new Error("Spotify token response did not include an access token.");
        }

        sessionStorage.setItem("spotify_access_token", String(data.access_token));
        sessionStorage.removeItem("spotify_code_verifier");
        sessionStorage.removeItem("spotify_auth_state");

        setStatus("success");
        setMessage("Spotify login succeeded. Access token saved to sessionStorage.");
        console.log("success reached");
      } catch (error) {
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to exchange code for tokens."
        );
        console.log("error reached", error);
      }
    }

    if (hasRunRef.current) {
      return;
    }

    hasRunRef.current = true;
    finishLogin();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-black/10 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-black">Spotify Callback</h1>
        <p className="text-sm text-black/70">{message}</p>
        {status === "loading" ? (
          <p className="text-sm text-black/60">Loading...</p>
        ) : null}
        {status === "success" ? (
          <p className="text-sm text-green-600">Success</p>
        ) : null}
        {status === "error" ? <p className="text-sm text-red-600">Error</p> : null}
      </div>
    </main>
  );
}
