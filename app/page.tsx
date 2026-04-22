"use client";

import { useEffect, useMemo, useState } from "react";

import { getSpotifyAuthorizeUrl, SPOTIFY_SCOPE_STRING } from "@/lib/spotify-pkce";

type Playlist = {
  id: string;
  name: string;
  owner: {
    display_name: string | null;
    id: string;
  };
  tracksTotal: number;
};

type Track = {
  playlistItemId: string;
  trackId: string | null;
  uri: string | null;
  name: string;
  artistNames: string[];
  albumName: string | null;
  durationMs: number | null;
  addedAt: string | null;
  playlistPosition: number;
};

type DuplicateGroup = {
  trackId: string;
  name: string;
  artistNames: string[];
  entries: Track[];
  keep: Track;
  remove: Track[];
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

type SpotifyCurrentUserResponse = {
  id: string;
};

type SpotifyPlaylistContentItem = {
  type?: string;
  id?: string | null;
  uri?: string | null;
  name?: string;
  artists?: Array<{
    name?: string;
  }>;
  album?: {
    name?: string | null;
  } | null;
  duration_ms?: number | null;
};

type SpotifyPlaylistItemsEntry = {
  added_at: string | null;
  added_by?: {
    id?: string | null;
  } | null;
  is_local?: boolean;
  primary_color?: string | null;
  item: SpotifyPlaylistContentItem | null;
};

type SpotifyPlaylistTracksResponse = {
  items: SpotifyPlaylistItemsEntry[];
  next: string | null;
};

function normalizePlaylistEntryToTrack(
  entry: SpotifyPlaylistItemsEntry,
  index: number
): Track {
  const content = entry.item;
  const isTrackLike = content?.type === "track";

  return {
    playlistItemId: `${content?.id ?? "no-track"}-${entry.added_at ?? "no-added-at"}-${index}`,
    trackId: isTrackLike ? content.id ?? null : null,
    uri: isTrackLike ? content.uri ?? null : null,
    name: isTrackLike ? content.name ?? "Unavailable track" : "Unavailable track",
    artistNames: isTrackLike
      ? content.artists?.map((artist) => artist.name ?? "Unknown artist") ?? []
      : [],
    albumName: isTrackLike ? content.album?.name ?? null : null,
    durationMs: isTrackLike ? content.duration_ms ?? null : null,
    addedAt: entry.added_at ?? null,
    playlistPosition: index + 1,
  };
}

export default function Home() {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(true);
  const [accessToken, setAccessToken] = useState("");
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [tracksError, setTracksError] = useState("");
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
      const storedRequestedScope = sessionStorage.getItem("spotify_requested_scope");

      if (!storedAccessToken) {
        setIsLoadingPlaylists(false);
        return;
      }

      if (storedRequestedScope !== SPOTIFY_SCOPE_STRING) {
        sessionStorage.removeItem("spotify_access_token");
        setIsLoadingPlaylists(false);
        setError("Spotify scopes changed. Clear sessionStorage and log in again.");
        return;
      }

      setAccessToken(storedAccessToken);
      setError("");

      try {
        const meResponse = await fetch("https://api.spotify.com/v1/me", {
          headers: {
            Authorization: `Bearer ${storedAccessToken}`,
          },
        });

        const meData: SpotifyCurrentUserResponse | { error?: { message?: string } } =
          await meResponse.json();

        if (!meResponse.ok || !("id" in meData)) {
          throw new Error("Unable to load current Spotify user.");
        }

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

        const nextPlaylists = data.items
          .filter((item) => item.owner.id === meData.id)
          .map((item) => {
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

  useEffect(() => {
    async function loadTracks() {
      if (!selectedPlaylistId || !accessToken) {
        setTracks([]);
        setTracksLoading(false);
        setTracksError("");
        return;
      }

      setTracksLoading(true);
      setTracksError("");

      try {
        let nextUrl:
          | string
          | null = `https://api.spotify.com/v1/playlists/${selectedPlaylistId}/items?limit=50`;
        const allEntries: SpotifyPlaylistItemsEntry[] = [];

        while (nextUrl) {
          const response: Response = await fetch(nextUrl, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          const data: SpotifyPlaylistTracksResponse | { error?: { message?: string } } =
            await response.json();

          if (!response.ok) {
            if (response.status === 403) {
              throw new Error(
                "Spotify returned 403 Forbidden. You can only load items for playlists you own or can collaborate on."
              );
            }

            const errorMessage =
              data &&
              typeof data === "object" &&
              "error" in data &&
              data.error &&
              typeof data.error === "object" &&
              "message" in data.error
                ? String(data.error.message)
                : "Unable to load playlist tracks.";

            throw new Error(errorMessage);
          }

          if (
            !data ||
            typeof data !== "object" ||
            !("items" in data) ||
            !Array.isArray(data.items) ||
            !("next" in data)
          ) {
            throw new Error("Spotify playlist tracks response was not in the expected format.");
          }

          allEntries.push(...data.items);
          console.log("playlist items page", {
            itemCount: data.items.length,
            hasNextPage: data.next !== null,
          });
          nextUrl = data.next;
        }

        const nextTracks = allEntries.map((entry, index) =>
          normalizePlaylistEntryToTrack(entry, index)
        );

        console.log("playlist pagination finished", {
          totalRawEntriesFetched: allEntries.length,
          totalNormalizedTracks: nextTracks.length,
        });

        setTracks(nextTracks);
      } catch (err) {
        setTracks([]);
        setTracksError(
          err instanceof Error ? err.message : "Unable to load playlist tracks."
        );
      } finally {
        setTracksLoading(false);
      }
    }

    loadTracks();
  }, [selectedPlaylistId, accessToken]);

  const showLogin = !accessToken;
  const duplicateGroups: DuplicateGroup[] = useMemo(
    () =>
      Object.values(
        tracks.reduce<
          Record<
            string,
            {
              trackId: string;
              name: string;
              artistNames: string[];
              entries: Track[];
            }
          >
        >((groups, track) => {
          if (!track.trackId) {
            return groups;
          }

          if (!groups[track.trackId]) {
            groups[track.trackId] = {
              trackId: track.trackId,
              name: track.name,
              artistNames: track.artistNames,
              entries: [],
            };
          }

          groups[track.trackId].entries.push(track);
          return groups;
        }, {})
      )
        .filter((group) => group.entries.length > 1)
        .map((group) => ({
          ...group,
          keep: group.entries[0],
          remove: group.entries.slice(1),
        })),
    [tracks]
  );

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
            {selectedPlaylistId && tracksLoading ? (
              <p className="text-sm text-black/70">Loading tracks...</p>
            ) : null}
            {selectedPlaylistId && tracksError ? (
              <p className="text-sm text-red-600">{tracksError}</p>
            ) : null}
            {selectedPlaylistId && !tracksLoading && !tracksError ? (
              <>
                <div className="flex flex-col gap-2 rounded-xl border border-black/10 p-4">
                  <h3 className="font-medium text-black">Track preview</h3>
                  <p className="text-sm text-black/70">
                    Total fetched tracks: {tracks.length}
                  </p>
                  {tracks.length === 0 ? (
                    <p className="text-sm text-black/70">No tracks found.</p>
                  ) : (
                    tracks.slice(0, 10).map((track) => (
                      <div key={track.playlistItemId} className="text-sm text-black/70">
                        <p className="text-black">{track.name}</p>
                        <p>
                          {track.artistNames.length > 0
                            ? track.artistNames.join(", ")
                            : "Unknown artist"}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex flex-col gap-2 rounded-xl border border-black/10 p-4">
                  <h3 className="font-medium text-black">Duplicate results</h3>
                  <p className="text-sm text-black/70">
                    Read-only for now. Use the playlist positions below to remove duplicates manually in Spotify.
                  </p>
                  {duplicateGroups.length === 0 ? (
                    <p className="text-sm text-black/70">No duplicates found.</p>
                  ) : (
                    duplicateGroups.map((group) => (
                      <div
                        key={group.trackId}
                        className="flex flex-col gap-1 text-sm text-black/70"
                      >
                        <p className="text-black">{group.name}</p>
                        <p>
                          {group.artistNames.length > 0
                            ? group.artistNames.join(", ")
                            : "Unknown artist"}
                        </p>
                        <p>Duplicate count: {group.entries.length}</p>
                        <p>Kept track count: 1</p>
                        <p>Removable count: {group.remove.length}</p>
                        <div className="rounded-lg bg-green-50 p-3">
                          <p className="text-black">Keep</p>
                          <p>{group.keep.name}</p>
                          <p>
                            {group.keep.artistNames.length > 0
                              ? group.keep.artistNames.join(", ")
                              : "Unknown artist"}
                          </p>
                          <p>Added at: {group.keep.addedAt ?? "Unknown"}</p>
                          <p>Playlist position: {group.keep.playlistPosition}</p>
                        </div>
                        {group.remove.length > 0 ? (
                          <div className="flex flex-col gap-2 pl-3">
                            {group.remove.map((track) => (
                              <div key={track.playlistItemId}>
                                <p className="text-black">Manual remove candidate</p>
                                <p>{track.name}</p>
                                <p>
                                  {track.artistNames.length > 0
                                    ? track.artistNames.join(", ")
                                    : "Unknown artist"}
                                </p>
                                <p>Added at: {track.addedAt ?? "Unknown"}</p>
                                <p>Playlist position: {track.playlistPosition}</p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
