import { useEffect, useRef, useState } from "react";
import { checkForUpdateOnChannel, type UpdateChannel, type UpdateInfo } from "../lib/update";
import { checkForUpdateViaBridge } from "../lib/updater-bridge";
const UPDATE_CHANNEL_KEY = "dak:update-channel";
function initialUpdateChannel(): UpdateChannel {
  return localStorage.getItem(UPDATE_CHANNEL_KEY) === "beta" ? "beta" : "stable";
}

export function useDesktopUpdates() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [showLatestMsg, setShowLatestMsg] = useState(false);
  const [updateChannel, setUpdateChannel] = useState<UpdateChannel>(initialUpdateChannel);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  async function doCheckUpdate() {
    setCheckingUpdate(true);
    setShowLatestMsg(false);
    try {
      // 桌面壳优先走 Python 桥（urllib，无 CORS），dev 退浏览器 fetch。
      const info = (await checkForUpdateViaBridge(updateChannel)) ?? (await checkForUpdateOnChannel(updateChannel));
      if (!mounted.current) return;
      setUpdate(info);
      if (!info) {
        setShowLatestMsg(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setShowLatestMsg(false), 3000);
      }
    } finally {
      if (mounted.current) setCheckingUpdate(false);
    }
  }

  function changeUpdateChannel(channel: UpdateChannel) {
    setUpdateChannel(channel);
    localStorage.setItem(UPDATE_CHANNEL_KEY, channel);
    setUpdate(null);
    setShowLatestMsg(false);
  }

  useEffect(() => { mounted.current = true; if (window.pywebview?.api) void doCheckUpdate(); return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); }; }, []);
  return { update, checkingUpdate, dismissedVersion, setDismissedVersion, showLatestMsg, updateChannel, doCheckUpdate, changeUpdateChannel };
}
