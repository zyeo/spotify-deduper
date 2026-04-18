"use client";

import { useEffect, useState } from "react";

import { getSpotifyAuthorizeUrl } from "@/lib/spotify-pkce";

type Playlist = {
  id: string;
  name: string;
  owner: {
    display_name: string | null;
    id: string;
  };
  tracksTotal: number;
};

type SpotifyPlaylistItem = {
  id: string;
  name: string;
  owner: {
    display_name: string | null;
    id: string;
  };
  items?: {
    total?: number;
    href?: string;
  };
};

type SpotifyPlaylistsResponse = {
  items: SpotifyPlaylistItem[];
};

export default function Home() {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(true);
  const [accessToken, setAccessToken] = useState("");
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    try {
      setIsLoggingIn(true);
      setError("");

      const authorizeUrl = await getSpotifyAuthorizeUrl();
      window.location.href = authorizeUrl;
    } catch (err) {
      setIsLoggingIn(false);
      setError(
        err instanceof Error ? err.message : "Unable to start Spotify login."
      );
    }
  };

  useEffect(() => {
    async function loadPlaylists() {
      const storedAccessToken = sessionStorage.getItem("spotify_access_token");

      if (!storedAccessToken) {
        setIsLoadingPlaylists(false);
        return;
      }

      setAccessToken(storedAccessToken);
      setError("");

      try {
        const response = await fetch("https://api.spotify.com/v1/me/playlists", {
          headers: {
            Authorization: `Bearer ${storedAccessToken}`,
          },
        });

        const data: SpotifyPlaylistsResponse | { error?: { message?: string } } =
          await response.json();

        if (!response.ok) {
          const errorMessage =
            data &&
            typeof data === "object" &&
            "error" in data &&
            data.error &&
            typeof data.error === "object" &&
            "message" in data.error
              ? String(data.error.message)
              : "Unable to load playlists.";

          throw new Error(errorMessage);
        }

        if (!data || typeof data !== "object" || !("items" in data) || !Array.isArray(data.items)) {
          throw new Error("Spotify playlists response was not in the expected format.");
        }

        const nextPlaylists = data.items.map((item) => {
          return {
            id: item.id,
            name: item.name,
            owner: {
              display_name: item.owner.display_name,
              id: item.owner.id,
            },
            tracksTotal: item.items?.total ?? 0,
          };
        });

        setPlaylists(nextPlaylists);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to load playlists."
        );
      } finally {
        setIsLoadingPlaylists(false);
      }
    }

    loadPlaylists();
  }, []);

  const showLogin = !accessToken;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-2xl flex-col gap-6 rounded-2xl border border-black/10 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold text-black">Spotify Deduper</h1>
          <p className="text-sm text-black/70">
            {showLogin
              ? "Start by logging in with Spotify."
              : "Your playlists are listed below."}
          </p>
        </div>

        {showLogin ? (
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="rounded-full bg-green-500 px-6 py-3 font-medium text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoggingIn ? "Redirecting..." : "Login with Spotify"}
            </button>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>
        ) : null}

        {!showLogin && isLoadingPlaylists ? (
          <p className="text-center text-sm text-black/70">Loading playlists...</p>
        ) : null}

        {!showLogin && error ? (
          <p className="text-center text-sm text-red-600">{error}</p>
        ) : null}

        {!showLogin && !isLoadingPlaylists && !error ? (
          <div className="flex flex-col gap-3">
            {playlists.length === 0 ? (
              <p className="text-center text-sm text-black/70">
                No playlists found.
              </p>
            ) : (
              playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  type="button"
                  onClick={() => setSelectedPlaylistId(playlist.id)}
                  className={`rounded-xl border p-4 text-left transition ${
                    selectedPlaylistId === playlist.id
                      ? "border-green-500 bg-green-50"
                      : "border-black/10 bg-white"
                  }`}
                >
                  <h2 className="font-medium text-black">{playlist.name}</h2>
                  <p className="text-sm text-black/70">
                    Owner: {playlist.owner?.display_name || playlist.owner?.id || "Unknown owner"}
                  </p>
                  <p className="text-sm text-black/70">
                    Tracks: {playlist.tracksTotal}
                  </p>
                </button>
              ))
            )}
            <p className="text-sm text-black/70">
              {selectedPlaylistId
                ? `Selected playlist ID: ${selectedPlaylistId}`
                : "Select a playlist to continue."}
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
