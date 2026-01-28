"use client";

import { useMemo, useState } from "react";

type Photo = {
  id: number;
  url: string;
  fileName: string;
};

type Props = {
  photos: Photo[];
};

export function RecordPhotoGallery({ photos }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const selectedCount = selectedIds.size;
  const allSelected = selectedCount > 0 && selectedCount === photos.length;

  const selectedPhotos = useMemo(
    () => photos.filter((photo) => selectedIds.has(photo.id)),
    [photos, selectedIds]
  );

  function togglePhoto(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) => {
      if (prev.size === photos.length) {
        return new Set();
      }
      return new Set(photos.map((photo) => photo.id));
    });
  }

  async function downloadSelected() {
    if (selectedPhotos.length === 0) return;

    for (const photo of selectedPhotos) {
      const link = document.createElement("a");
      link.href = `/api/records/photos/${photo.id}?download=1`;
      link.download = photo.fileName || `record-photo-${photo.id}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-zinc-500">
          {selectedCount > 0
            ? `${selectedCount}枚選択中`
            : "写真をクリックして選択"}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={toggleAll}
            className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 hover:border-sky-300 hover:text-sky-600"
          >
            {allSelected ? "全選択を解除" : "すべて選択"}
          </button>
          <button
            type="button"
            onClick={downloadSelected}
            disabled={selectedCount === 0}
            className="rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
          >
            選択した写真をダウンロード
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((photo) => {
          const isSelected = selectedIds.has(photo.id);
          return (
            <button
              key={photo.id}
              type="button"
              onClick={() => togglePhoto(photo.id)}
              className={`group relative overflow-hidden rounded-2xl border bg-zinc-50 text-left transition focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                isSelected
                  ? "border-sky-500 ring-2 ring-sky-400"
                  : "border-zinc-200"
              }`}
              aria-pressed={isSelected}
            >
              <img
                src={photo.url}
                alt={photo.fileName}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              {isSelected ? (
                <div
                  className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-sm font-semibold text-white"
                  aria-hidden="true"
                >
                  ✓
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
