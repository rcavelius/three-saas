import type { Metadata } from "next";
import { AccountNav } from "@/components/account/AccountNav";
import { ChangePasswordForm, DeleteAccountForm, ProfileForm, SessionsList } from "@/components/account/AccountForms";
import { SignOutButton } from "@/components/SignOutButton";
import { PageTitle, secondaryButton } from "@/components/ui";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage() {
  const v = await requireViewer("/account");
  const { rows } = await v.p.handle.executor.query<{ name: string }>(
    `SELECT o.name FROM auth_member m JOIN auth_organization o ON o.id = m.organization_id
     WHERE m.user_id = $1 AND 'owner' = ANY(string_to_array(replace(m.role, ' ', ''), ','))
       AND NOT EXISTS (SELECT 1 FROM auth_member x WHERE x.organization_id = m.organization_id AND x.user_id <> $1
                         AND 'owner' = ANY(string_to_array(replace(x.role, ' ', ''), ',')))
     ORDER BY o.name`,
    [v.user.id],
  );
  return (
    <div className="mx-auto max-w-4xl px-5 py-14 sm:px-8">
      <PageTitle eyebrow="Account" title="Profile & security" lede={<span className="num text-base">{v.user.email}</span>} />
      <AccountNav current="/account" />
      <div className="mt-10 grid gap-12">
        <section aria-labelledby="profile">
          <h2 id="profile" className="font-display text-2xl font-semibold">Profile</h2>
          <div className="mt-4 max-w-md">
            <ProfileForm name={v.user.name} />
          </div>
        </section>
        <section aria-labelledby="password">
          <h2 id="password" className="font-display text-2xl font-semibold">Password</h2>
          <div className="mt-4 max-w-md">
            <ChangePasswordForm />
          </div>
        </section>
        <section aria-labelledby="sessions">
          <h2 id="sessions" className="font-display text-2xl font-semibold">Signed-in devices</h2>
          <div className="mt-4">
            <SessionsList currentSessionId={v.session.id} />
          </div>
          <div className="mt-4">
            <SignOutButton everywhere className={secondaryButton} label="Sign out everywhere, including here" />
          </div>
        </section>
        <section aria-labelledby="delete" className="border-t border-rule pt-10">
          <h2 id="delete" className="font-display text-2xl font-semibold text-fail">Delete account</h2>
          <div className="mt-4 max-w-2xl">
            <DeleteAccountForm soleOwnerOrgs={rows.map((r) => r.name)} />
          </div>
        </section>
      </div>
    </div>
  );
}
