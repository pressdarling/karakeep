import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import {
  BookmarkTypes,
  ZNewBookmarkRequest,
  zNewBookmarkRequestSchema,
} from "@karakeep/shared/types/bookmarks";

import { NEW_BOOKMARK_REQUEST_KEY_NAME } from "./background/protocol";
import { Button } from "./components/ui/button";
import Spinner from "./Spinner";
import usePluginSettings from "./utils/settings";
import { api } from "./utils/trpc";
import { MessageType } from "./utils/type";
import { isHttpUrl } from "./utils/url";

export default function SavePage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | undefined>(undefined);
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);
  const [bookmarkRequest, setBookmarkRequest] =
    useState<ZNewBookmarkRequest | null>(null);
  const [allTabs, setAllTabs] = useState<chrome.tabs.Tab[]>([]);
  const [currentWindowTabs, setCurrentWindowTabs] = useState<chrome.tabs.Tab[]>(
    [],
  );
  const [shouldTriggerBulkSave, setShouldTriggerBulkSave] = useState(false);

  const { settings, isPending: isSettingsLoading } = usePluginSettings();

  const {
    data,
    mutate: createBookmark,
    status,
  } = api.bookmarks.createBookmark.useMutation({
    onError: (e) => {
      setError("Something went wrong: " + e.message);
    },
    onSuccess: async () => {
      // After successful creation, update badge cache and notify background
      const [currentTab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      await chrome.runtime.sendMessage({
        type: MessageType.BOOKMARK_REFRESH_BADGE,
        currentTab: currentTab,
      });
    },
  });

  useEffect(() => {
    if (isSettingsLoading) {
      return;
    }

    if (!settings.apiKey || !settings.address) {
      return;
    }

    async function prepareBookmarkData() {
      try {
        let newBookmarkRequest: ZNewBookmarkRequest | null = null;

        const { [NEW_BOOKMARK_REQUEST_KEY_NAME]: req } =
          await chrome.storage.session.get(NEW_BOOKMARK_REQUEST_KEY_NAME);

        if (req) {
          // Delete the request immediately to avoid issues with lingering values
          await chrome.storage.session.remove(NEW_BOOKMARK_REQUEST_KEY_NAME);

          if (req.type === "BULK_SAVE_ALL_TABS") {
            setShouldTriggerBulkSave(true);
            return;
          }

          const parsed = zNewBookmarkRequestSchema.safeParse(req);
          if (parsed.success) {
            newBookmarkRequest = parsed.data;
          } else {
            console.error("Bookmark request validation failed", parsed.error);
            setError("Invalid bookmark request");
            return;
          }
        } else {
          const [currentTab] = await chrome.tabs.query({
            active: true,
            lastFocusedWindow: true,
          });

          setCurrentTab(currentTab);

          if (currentTab?.url) {
            const candidate = {
              type: BookmarkTypes.LINK,
              url: currentTab.url,
            };
            const parsedCandidate =
              zNewBookmarkRequestSchema.safeParse(candidate);
            if (parsedCandidate.success) {
              newBookmarkRequest = parsedCandidate.data;
            } else {
              console.error(
                "Bookmark request validation failed",
                parsedCandidate.error,
              );
              setError("Invalid bookmark request");
              return;
            }
          } else {
            setError("Couldn't find the URL of the current tab");
            return;
          }
        }

        const tabs = await chrome.tabs.query({});
        const validTabs = tabs.filter(
          (tab) =>
            tab.url &&
            (tab.url.startsWith("http://") || tab.url.startsWith("https://")) &&
            !tab.url.startsWith("chrome://") &&
            !tab.url.startsWith("chrome-extension://") &&
            !tab.url.startsWith("moz-extension://"),
        );
        setAllTabs(validTabs);

        const currentWindowTabsQuery = await chrome.tabs.query({
          currentWindow: true,
        });
        const validCurrentWindowTabs = currentWindowTabsQuery.filter(
          (tab) =>
            tab.url &&
            (tab.url.startsWith("http://") || tab.url.startsWith("https://")) &&
            !tab.url.startsWith("chrome://") &&
            !tab.url.startsWith("chrome-extension://") &&
            !tab.url.startsWith("moz-extension://"),
        );
        setCurrentWindowTabs(validCurrentWindowTabs);

        setBookmarkRequest(newBookmarkRequest);

        if (settings.autoSave && newBookmarkRequest) {
          createBookmark(newBookmarkRequest);
        }
      } catch (e) {
        console.error("Failed to prepare bookmark data", e);
        setError("Something went wrong while preparing the bookmark.");
      }
    }

    prepareBookmarkData();
  }, [
    createBookmark,
    settings.autoSave,
    settings.apiKey,
    settings.address,
    isSettingsLoading,
  ]);

  useEffect(() => {
    if (shouldTriggerBulkSave) {
      setShouldTriggerBulkSave(false);
      navigate("/bulk-save?auto=all");
    }
  }, [shouldTriggerBulkSave, navigate]);

  const handleManualSave = () => {
    if (bookmarkRequest) {
      createBookmark(bookmarkRequest);
    }
  };

  if (isSettingsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (!settings.apiKey || !settings.address) {
    return (
      <div className="py-4 text-center">
        <p className="text-gray-600">Extension not configured.</p>
        <p className="text-sm text-gray-500">Please check your settings.</p>
      </div>
    );
  }

  // If bulk save is active, show progress
  if (bulkSaveStatus.isActive) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="mb-2 text-lg font-semibold text-gray-800">
            {bulkSaveStatus.saveType === "window"
              ? "Saving Current Window Tabs"
              : "Saving All Tabs"}
          </h2>
          <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <div className="flex justify-between text-sm font-medium text-blue-800">
              <span>Progress:</span>
              <span>
                {bulkSaveStatus.completed} / {bulkSaveStatus.total}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-blue-200">
              <div
                className="h-2 rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: `${bulkSaveStatus.progress}%` }}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-center">
          <Spinner />
        </div>
      </div>
    );
  }

  // If bulk save completed with results, show summary
  if (!bulkSaveStatus.isActive && bulkSaveStatus.total > 0) {
    const hasErrors = bulkSaveStatus.errors.length > 0;

    return (
      <div className="space-y-4">
        <div>
          <h2 className="mb-2 text-lg font-semibold">
            {bulkSaveStatus.saveType === "window"
              ? "Window Save Complete!"
              : "Bulk Save Complete!"}
          </h2>
          <div
            className={`space-y-2 rounded-lg p-3 ${hasErrors ? "border border-yellow-200 bg-yellow-50" : "border border-green-200 bg-green-50"}`}
          >
            <div className="text-sm">
              <div
                className={`font-semibold ${hasErrors ? "text-yellow-800" : "text-green-800"}`}
              >
                Successfully saved: {bulkSaveStatus.completed} /{" "}
                {bulkSaveStatus.total} tabs
              </div>
              {closeTabs && bulkSaveStatus.completed > 0 && (
                <div className="mt-1 text-xs text-gray-600">
                  {bulkSaveStatus.completed > 1
                    ? "Tabs have been closed"
                    : "Tab has been closed"}
                </div>
              )}
              {hasErrors && (
                <div className="mt-2">
                  <div className="font-semibold text-yellow-800">Errors:</div>
                  <div className="mt-1 max-h-20 overflow-y-auto rounded bg-yellow-100 p-2 text-xs text-yellow-700">
                    {bulkSaveStatus.errors.slice(0, 3).map((error, i) => (
                      <div key={i} className="mb-1 truncate">
                        {error}
                      </div>
                    ))}
                    {bulkSaveStatus.errors.length > 3 && (
                      <div className="font-medium">
                        ... and {bulkSaveStatus.errors.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <Button
          onClick={() =>
            setBulkSaveStatus({
              isActive: false,
              progress: 0,
              total: 0,
              completed: 0,
              errors: [],
              saveType: null,
            })
          }
          className="w-full"
        >
          Done
        </Button>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  switch (status) {
    case "error": {
      return <div className="text-red-500">{error}</div>;
    }
    case "success": {
      return <Navigate to={`/bookmark/${data.id}`} />;
    }
    case "pending": {
      return (
        <div className="flex justify-between text-lg">
          <span>Saving Bookmark </span>
          <Spinner />
        </div>
      );
    }
    case "idle": {
      if (!settings.autoSave) {
        return (
          <div className="space-y-4">
            <div>
              <h2 className="mb-2 text-lg font-semibold">Save Bookmark</h2>
              {currentTab && (
                <div className="space-y-2 rounded-lg bg-gray-50 p-3">
                  <div className="text-sm font-medium text-gray-700">
                    {currentTab.title || "Untitled"}
                  </div>
                  <div className="break-all text-xs text-gray-500">
                    {currentTab.url}
                  </div>
                </div>
              )}
            </div>

            <Button
              onClick={handleManualSave}
              className="w-full"
              disabled={!bookmarkRequest}
            >
              Save Current Tab
            </Button>

            {(allTabs.length > 1 || currentWindowTabs.length > 1) && (
              <>
                <div className="text-center text-sm text-gray-500">or</div>

                <Button
                  onClick={() => navigate("/bulk-save")}
                  variant="outline"
                  className="w-full"
                >
                  Save multiple tabs
                </Button>
              </>
            )}

            {error && <div className="text-sm text-red-500">{error}</div>}
          </div>
        );
      } else {
        return (
          <div className="space-y-4">
            <div>
              <h2 className="mb-2 text-lg font-semibold">Quick Actions</h2>
              <div className="mb-3 text-sm text-gray-600">
                Current tab will be saved automatically
              </div>
            </div>

            {(allTabs.length > 1 || currentWindowTabs.length > 1) && (
              <div className="space-y-2">
                <Button
                  onClick={() => navigate("/bulk-save")}
                  variant="outline"
                  className="w-full"
                >
                  Save multiple tabs
                </Button>
              </div>
            )}

            {error && <div className="text-sm text-red-500">{error}</div>}
          </div>
        );
      }
    }
  }
}
