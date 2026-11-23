import type { Metadata } from "next";
import { AccountSettings } from "@/components/account/AccountSettings";
import { AccountNav } from "@/components/account/Meter";
import { SignOutButton } from "@/components/auth/AuthForms";
import { requireMember } from "@/lib/server-session";

export const metadata: Metadata = { title: "Account", robots: { index: false, follow: false } };

export default async function AccountPage() {
  const { p, user, headers } = await requireMember("/account");
  const s = await p.auth.getSession(headers);
  const { rows } = await p.ex.query<{ name: string }>(
    `SELECT o.name FROM auth_member m JOIN auth_organization o ON o.id = m.organization_id
     WHERE m.user_id = $1 AND 'owner' = ANY(string_to_array(replace(m.role, ' ', ''), ','))
       AND NOT EXISTS (SELECT 1 FROM auth_member x WHERE x.organization_id = m.organization_id AND x.user_id <> $1
                       AND 'owner' = ANY(string_to_array(replace(x.role, ' ', ''), ',')))`,
    [user.id],
  );
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-10">
      <AccountNav current="account" />
      <div className="flex items-center gap-3">
        <h1 className="wt-h2 text-[30px] md:text-[34px]">Account</h1>
        <div className="ml-auto">
          <SignOutButton className="btn" />
        </div>
      </div>
      <div className="mt-8 max-w-2xl">
        <AccountSettings
          name={user.name}
          email={user.email}
          currentSessionId={s?.session.id ?? ""}
          ownsSoleWorkspaces={rows.map((r) => r.name)}
        />
      </div>
    </div>
  );
}
