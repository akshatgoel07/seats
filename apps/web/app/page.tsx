"use client";
import { useEffect, useState } from "react";
import { ApiService } from "@/services/api";
import Link from "next/link";

export default function Home() {
  const [layouts, setLayouts] = useState(
    /** @type {Array<{ id: string, name?: string, venueName?: string, status?: string }>} */ ([]),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Layouts are venue-scoped in the new backend, so list venues first,
        // then gather each venue's layouts for a flat, openable list.
        const venues = (await ApiService.listVenues()) || [];
        const perVenue = await Promise.all(
          venues.map(async (v) => {
            const ls = (await ApiService.listLayouts(v.id)) || [];
            return ls.map((l) => ({ ...l, venueName: v.name }));
          }),
        );
        if (!cancelled) setLayouts(perVenue.flat());
      } catch (err) {
        console.error("Error loading layouts:", err);
        if (!cancelled) setError(err.message || "Failed to load layouts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-2xl font-bold mb-6">Seat Layouts</h1>
      {loading && <p>Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {!loading && !error && layouts.length === 0 && (
        <p className="text-gray-500">No layouts yet.</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {layouts.map((layout) => (
          <Link
            key={layout.id}
            href={`/editor/${layout.id}`}
            className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <h2 className="text-lg font-semibold">{layout.name}</h2>
            <p className="text-sm text-gray-500">{layout.venueName}</p>
            <p className="text-xs text-gray-400 mt-1">{layout.status}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
