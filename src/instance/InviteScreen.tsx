import { useMutation } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { AppSupabase } from "../supabase/client";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ErrorText } from "../ui/ErrorText";
import { Field } from "../ui/Field";
import { Subscreen } from "../ui/Subscreen";
import { buildConnectLink } from "./connect-link";
import { useConnectedInstance, useSupabase } from "./instance-context";
import { hashInviteCode, newInviteCode } from "./invite-code";

export function InviteScreen() {
  const { t } = useTranslation();
  const createInvite = useCreateInvite();

  return (
    <Subscreen back={{ to: "/profile", place: t("profile.title") }} title={t("invite.title")}>
      <Card title={t("invite.card")}>
        <p className="text-sm text-zinc-500">{t("invite.explained")}</p>
        {createInvite.data && <Invite link={createInvite.data} />}
        {createInvite.error && <ErrorText>{t("invite.failed")}</ErrorText>}
        <Button
          variant={createInvite.data ? "secondary" : "primary"}
          onClick={() => createInvite.mutate()}
          disabled={createInvite.isPending}
          className="self-start"
        >
          {createInvite.data ? t("invite.createAnother") : t("invite.create")}
        </Button>
      </Card>
      <p className="text-sm text-zinc-500">
        {t("invite.afterSignUp")}{" "}
        <Link to="/spaces" className="font-medium text-emerald-700 dark:text-emerald-400">
          {t("profile.spaces.manage")}
        </Link>
      </p>
    </Subscreen>
  );
}

function useCreateInvite() {
  const supabase = useSupabase();
  const instance = useConnectedInstance();
  return useMutation({
    async mutationFn() {
      const inviteCode = await storeInviteCode(supabase);
      return buildConnectLink(window.location.href, { instance, inviteCode });
    },
  });
}

async function storeInviteCode(supabase: AppSupabase): Promise<string> {
  const code = newInviteCode();
  const { error } = await supabase
    .from("invite_codes")
    .insert({ code_hash: await hashInviteCode(code) });
  if (error) throw error;
  return code;
}

function Invite({ link }: { link: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Dark on white whatever the theme: some scanners can't read a light-on-dark code. */}
      <QRCodeSVG
        value={link}
        size={224}
        marginSize={4}
        title={t("invite.qr")}
        className="self-center rounded-lg"
      />
      <Field label={t("invite.link")} value={link} readOnly onFocus={(e) => e.target.select()} />
      <div className="flex flex-wrap items-center gap-3">
        {"share" in navigator && (
          // Closing the share sheet without picking anything rejects, and that's no error.
          <Button onClick={() => void navigator.share({ url: link }).catch(() => {})}>
            {t("invite.share")}
          </Button>
        )}
        <Button variant="secondary" onClick={() => void copy()}>
          {t("invite.copy")}
        </Button>
        {copied && <p className="text-sm text-emerald-600">{t("invite.copied")}</p>}
      </div>
    </div>
  );
}
