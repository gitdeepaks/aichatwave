import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Exists only to give the profile page a title.
 *
 * `app/app/profile/page.tsx` is a client component — it reads Clerk's user and
 * Polar's meters through hooks — and a client component cannot export
 * `metadata`. A one-line layout is the framework's answer to that, and it is
 * cheaper than converting a working page to fetch on the server.
 */
export const metadata: Metadata = { title: "Profile" };

export default function ProfileLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
