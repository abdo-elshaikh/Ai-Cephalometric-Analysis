import React, { useState } from "react";
import {
  Bell,
  Check,
  X,
  AlertCircle,
  Info,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
  ChevronRight,
} from "lucide-react";
import type { Notification } from "@/lib/mappers";
import { cn } from "@/lib/utils";

interface NotificationCenterProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}

export default function NotificationCenter({
  notifications,
  onMarkAsRead,
  onDismiss,
  onClearAll,
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  function getIcon(type: Notification["type"]) {
    switch (type) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "info":
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  }

  function getTypeColor(type: Notification["type"]): string {
    switch (type) {
      case "success":
        return "bg-green-500/8 border-green-500/20";
      case "error":
        return "bg-red-500/8 border-red-500/20";
      case "warning":
        return "bg-amber-500/8 border-amber-500/20";
      case "info":
        return "bg-blue-500/8 border-blue-500/20";
    }
  }

  const recent = notifications.slice(0, 5);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown menu */}
      {open && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30"
            aria-hidden
          />
          {/* Panel */}
          <div className="absolute right-0 top-full z-40 mt-2 w-80 rounded-lg border border-border/40 bg-card shadow-lg animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/30 p-3.5">
              <p className="text-sm font-semibold text-foreground">Notifications</p>
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                  title="Clear all notifications"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>

            {/* List */}
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
                <Bell className="h-6 w-6 text-muted-foreground/40" />
                <p className="text-xs font-medium text-muted-foreground/60">
                  No notifications yet
                </p>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-1.5 p-2 [scrollbar-width:thin]">
                {recent.map(notif => (
                  <button
                    key={notif.id}
                    onClick={() => {
                      if (!notif.read) onMarkAsRead(notif.id);
                    }}
                    className={cn(
                      "w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/40",
                      getTypeColor(notif.type),
                      !notif.read && "bg-muted/20"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        {getIcon(notif.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground leading-tight">
                            {notif.title}
                          </p>
                          {!notif.read && (
                            <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                          {notif.detail}
                        </p>
                        <p className="mt-1 text-[9px] text-muted-foreground/60">
                          {notif.timestamp}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onDismiss(notif.id);
                        }}
                        className="mt-0.5 shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Footer: View all link */}
            {notifications.length > 5 && (
              <div className="border-t border-border/30 px-3 py-2.5">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded text-[12px] font-medium text-primary hover:bg-muted/30 px-2 py-1.5 transition-colors"
                >
                  View all notifications
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
