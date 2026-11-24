import { useEffect, useRef } from "react";
import type { BookSseEvent } from "../../core/types.js";

export function useBookEvents(
  bookId: string | null,
  enabled: boolean,
  onEvent: (event: BookSseEvent) => void,
): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!bookId || !enabled) return;

    const source = new EventSource(`/api/books/${encodeURIComponent(bookId)}/events`);

    const handle = (e: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(e.data) as BookSseEvent;
        onEventRef.current(parsed);
      } catch {
        // Ignore malformed payloads
      }
    };

    source.addEventListener("segment_updated", handle as EventListener);
    source.addEventListener("prescan_progress", handle as EventListener);
    source.addEventListener("book_status", handle as EventListener);

    return () => {
      source.close();
    };
  }, [bookId, enabled]);
}
