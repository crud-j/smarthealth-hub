import { redirect } from "next/navigation";

/**
 * Security moved into Profile & Security (/settings/profile). Old links and
 * bookmarks land on its Passkeys section.
 */
export default function SecurityPage(): never {
  redirect("/settings/profile#passkeys");
}
