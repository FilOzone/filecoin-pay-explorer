"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Notice } from "@/components/shared/Notice";

/**
 * MOCK — Access groups POC.
 *
 * Every row, key, and count on this page is fabricated in-component. Nothing
 * reads the chain, keysmith, or any backend; no key material exists. The page
 * exists to review the access-management surface for the encryption group
 * model (PRD rev 2026-10-06): account master key -> group (scope) keys ->
 * piece keys. Groups are user groups/roles — never folders.
 */

/** Reuse detection must survive case tricks and Unicode homoglyphs (journey finding P1): NFKC-fold then casefold. */
const normalizeLabel = (label: string) => label.trim().normalize("NFKC").toLowerCase();

type MockMember = {
  label: string;
  key: string;
  kind: "agent" | "person";
  added: string;
  /**
   * Fetch access for RESTRICTED pieces (the 10-05 opt-in ACL): restricted
   * pieces are served only from the authenticated /download endpoint, so a
   * member needs a token on top of the decryption key. Token contract is a
   * P0 open question (PRD §15) — this column shows the slot, not a design.
   */
  fetchToken: "issued" | "none";
  /**
   * Write is PER-IDENTITY, never a group property: it is this identity's own
   * SessionKeyRegistry grant (the server checks the exact signer), cannot be
   * handed onward by the member, and is managed under Session Keys.
   */
  ownWriteKey: string | null;
};

type MockGroup = {
  name: string;
  members: MockMember[];
  covers: string;
  restricted: string;
  created: string;
};

const INITIAL_GROUPS: MockGroup[] = [
  {
    name: "research-partners",
    created: "Sep 28",
    covers: "500 pieces · 4 data sets",
    restricted: "80 of 500 pieces restricted",
    members: [
      {
        label: "build agent",
        key: "0x02b7f4…9e2c",
        kind: "agent",
        added: "Sep 28",
        fetchToken: "issued",
        ownWriteKey: "0x5929…c41a",
      },
      {
        label: "anna (research)",
        key: "0x03d19a…44F0",
        kind: "person",
        added: "Sep 28",
        fetchToken: "none",
        ownWriteKey: null,
      },
      {
        label: "reviewer (external)",
        key: "0x0e77c2…1ab4",
        kind: "person",
        added: "Oct 05",
        fetchToken: "issued",
        ownWriteKey: null,
      },
    ],
  },
  {
    name: "finance",
    created: "Oct 02",
    covers: "12 pieces · 1 data set",
    restricted: "all 12 pieces restricted",
    members: [
      {
        label: "cfo laptop",
        key: "0x9b4410…caa2",
        kind: "person",
        added: "Oct 02",
        fetchToken: "issued",
        ownWriteKey: null,
      },
    ],
  },
];

const MockChip = () => (
  <span className='rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700'>
    MOCK
  </span>
);

const KindPill = ({ kind }: { kind: MockMember["kind"] }) => (
  <span
    className={
      kind === "agent"
        ? "rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700"
        : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
    }
  >
    {kind}
  </span>
);

const StopIssuingDialog = ({
  member,
  onClose,
}: {
  member: MockMember | null;
  onClose: (confirmed: boolean) => void;
}) => (
  <Dialog open={member !== null} onOpenChange={(open) => !open && onClose(false)}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Stop issuing to {member?.label}?</DialogTitle>
        <DialogDescription>
          This is membership-going-forward, not revocation. {member?.label} keeps everything they could already read —
          that is how keys work. New data stays readable to them until you cycle this group (epoch bump, re-encrypt,
          re-upload — deferred in v1).
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant='ghost' onClick={() => onClose(false)}>
          Cancel
        </Button>
        <Button variant='primary' onClick={() => onClose(true)}>
          Stop issuing
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

const CreateGroupDialog = ({
  open,
  existingNames,
  onClose,
  onOpenExisting,
}: {
  open: boolean;
  existingNames: string[];
  onClose: (name: string | null) => void;
  onOpenExisting: (name: string) => void;
}) => {
  const [name, setName] = useState("");
  const existingMatch = existingNames.find((n) => normalizeLabel(n) === normalizeLabel(name));
  const isReuse = name.trim() !== "" && existingMatch !== undefined;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create group</DialogTitle>
          <DialogDescription>
            A group is a named key. Everything you or your agents encrypt under the group&apos;s name is readable by its
            members — across data sets. Pick a unique, specific name. Creating mints nothing and signs nothing: the key
            is a pure derivation from your master key, realized at first use (first member, first upload).
          </DialogDescription>
        </DialogHeader>
        <input
          type='text'
          value={name}
          maxLength={64}
          onChange={(e) => setName(e.target.value)}
          placeholder='group name — e.g. research-partners-2026'
          className='w-full rounded-lg border px-3 py-2 font-mono text-sm'
        />
        {isReuse && (
          <Notice tone='warn' title={`A group matching "${name.trim()}" already exists ("${existingMatch}").`}>
            <p>
              Creating it again would re-create the same key — everyone who ever held it would read the new data.
              (Matching ignores case and Unicode look-alikes; the real canonicalization rules are a keysmith-spec item.
              Best-effort check: the console can only see groups with uploaded data or console records.)
            </p>
            <Button
              variant='ghost'
              size='compact'
              className='mt-2'
              onClick={() => {
                onClose(null);
                onOpenExisting(existingMatch ?? name.trim());
              }}
            >
              Open &quot;{existingMatch}&quot; instead →
            </Button>
          </Notice>
        )}
        <DialogFooter>
          <Button variant='ghost' onClick={() => onClose(null)}>
            Cancel
          </Button>
          <Button variant='primary' disabled={name.trim() === "" || isReuse} onClick={() => onClose(name.trim())}>
            Create group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const GroupDetail = ({
  group,
  onBack,
  onStopIssuing,
  onAddMember,
}: {
  group: MockGroup;
  onBack: () => void;
  onStopIssuing: (member: MockMember) => void;
  onAddMember: (key: string) => void;
}) => {
  const [memberKey, setMemberKey] = useState("");
  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center gap-3'>
        <Button variant='ghost' size='compact' onClick={onBack}>
          ← All groups
        </Button>
        <h2 className='text-lg font-semibold'>{group.name}</h2>
        <span className='rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700'>group key</span>
        <MockChip />
      </div>

      <Notice tone='info' title='Three independent axes — a member can hold any combination.'>
        <b>Decrypt</b> (this group&apos;s key — what membership grants) · <b>Fetch restricted</b> (a /download token for
        pieces the owner retrieval-restricted; open pieces need nothing) · <b>Write</b> (the identity&apos;s OWN session
        key — never granted by the group, never transferable to others; the registry checks the exact signer).
      </Notice>

      <table className='w-full text-sm'>
        <thead>
          <tr className='border-b text-left text-xs uppercase tracking-wide text-muted-foreground'>
            <th className='py-2 pr-3'>Member</th>
            <th className='py-2 pr-3'>Key</th>
            <th className='py-2 pr-3'>Kind</th>
            <th className='py-2 pr-3'>Added</th>
            <th className='py-2 pr-3'>Decrypt</th>
            <th className='py-2 pr-3'>Fetch restricted</th>
            <th className='py-2 pr-3'>Write (own credential)</th>
            <th className='py-2' />
          </tr>
        </thead>
        <tbody>
          {group.members.length === 0 && (
            <tr>
              <td colSpan={8} className='py-4 text-center text-xs text-muted-foreground'>
                No members yet. This group is just a name so far — its key becomes real at the first member grant or the
                first upload under the label. Deleting it now would lose nothing.
              </td>
            </tr>
          )}
          {group.members.map((m) => (
            <tr key={m.key} className='border-b'>
              <td className='py-2 pr-3 font-medium'>{m.label}</td>
              <td className='max-w-[220px] break-all py-2 pr-3 font-mono text-xs'>{m.key}</td>
              <td className='py-2 pr-3'>
                <KindPill kind={m.kind} />
              </td>
              <td className='py-2 pr-3'>{m.added}</td>
              <td className='py-2 pr-3 text-xs'>
                <b className='text-green-700'>yes</b> <span className='text-muted-foreground'>(member)</span>
              </td>
              <td className='py-2 pr-3 text-xs'>
                {m.fetchToken === "issued" ? (
                  <span>
                    token issued <span className='text-muted-foreground'>(mock — contract open, PRD §15)</span>
                  </span>
                ) : (
                  <span className='text-amber-700'>
                    no token — can&apos;t fetch this group&apos;s restricted pieces ({group.restricted})
                    <span className='text-muted-foreground'> — no action exists yet: token contract open, PRD §15</span>
                  </span>
                )}
              </td>
              <td className='py-2 pr-3 text-xs'>
                {m.ownWriteKey ? (
                  <span>
                    own session key <span className='font-mono'>{m.ownWriteKey}</span>
                  </span>
                ) : (
                  <span className='text-muted-foreground'>none</span>
                )}
              </td>
              <td className='py-2 text-right'>
                <Button variant='ghost' size='compact' onClick={() => onStopIssuing(m)}>
                  Stop issuing
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className='text-xs text-muted-foreground'>
        Coverage: {group.covers} · {group.restricted} — open pieces are fetchable by anyone (decrypt still requires the
        group key). Counts as reported at upload: proposed source is an indexed scope commitment (salted label hash) in
        on-chain piece metadata — never the raw group name; the envelope header stays ground truth. (Open: PRD §15
        &quot;Group coverage index&quot;.)
      </p>

      <div className='rounded-lg border p-4'>
        <p className='mb-2 text-sm font-semibold'>Add a member</p>
        <input
          type='text'
          value={memberKey}
          onChange={(e) => setMemberKey(e.target.value)}
          placeholder='Paste a public key — like adding a deploy key on GitHub (accepted formats: pending eng)'
          className='w-full rounded-lg border px-3 py-2 font-mono text-xs'
        />
        <div className='mt-2 flex items-center gap-3'>
          <Button
            variant='primary'
            size='compact'
            disabled={
              memberKey.trim() === "" || group.members.some((m) => normalizeLabel(m.key) === normalizeLabel(memberKey))
            }
            onClick={() => {
              onAddMember(memberKey.trim());
              setMemberKey("");
            }}
          >
            Add member
          </Button>
          <span className='text-xs text-muted-foreground'>
            no wallet prompt — the group key derives from your keystore in page memory and wraps to the new member;
            nothing on chain
          </span>
        </div>
        {group.members.some((m) => normalizeLabel(m.key) === normalizeLabel(memberKey)) && memberKey.trim() !== "" && (
          <p className='mt-2 text-xs text-amber-700'>
            Already a member — each key appears once; re-adding changes nothing.
          </p>
        )}
        <p className='mt-2 text-xs text-muted-foreground'>
          Adding an <b>agent</b>? Agents receive group keys through the session-key pairing flow — re-open the
          agent&apos;s authorize link from{" "}
          <Link href='/console/session-keys' className='underline'>
            Session Keys
          </Link>
          . This box is for people&apos;s public keys.
        </p>
      </div>

      <Notice tone='warn' title='"Stop issuing" is membership-going-forward, not revocation.'>
        Anyone who held the key keeps reading existing data. Real revocation = stop issuing + cycle (epoch bump →
        re-encrypt → re-upload → new links) — cycling execution is deferred in v1.
      </Notice>
      <Notice tone='info' title='Write never travels with the group.'>
        A group distributes READ capability only. Writing requires the identity&apos;s own SessionKeyRegistry grant
        (create/add/delete scopes, managed under Session Keys) — the server authorizes the exact signing key, so a
        member cannot delegate or share their write access with anyone, including other members of this group.
      </Notice>
    </div>
  );
};

const AccessGroupsSection = () => {
  const [groups, setGroups] = useState<MockGroup[]>(INITIAL_GROUPS);
  const [createOpen, setCreateOpen] = useState(false);
  const [stopTarget, setStopTarget] = useState<{ group: string; member: MockMember } | null>(null);

  // Selection lives in the URL (?group=) so browser Back returns to the list
  // and F5 keeps the detail open (journey finding P1/J7) — the real build gets
  // a route (/console/access/<group>, per the wireframes); a query param is
  // the honest mock of that contract.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = searchParams.get("group");
  const openGroup = (name: string | null) =>
    router.push(name === null ? pathname : `${pathname}?group=${encodeURIComponent(name)}`);

  const selectedGroup = groups.find((g) => g.name === selected);

  return (
    <div className='flex flex-col gap-4'>
      <Notice tone='warn' title='Mock preview — nothing on this page is real.'>
        Fabricated data, no keys, no chain, no backend. POC for the encryption group model (PRD rev 2026-10-06): a group
        is a named key derived from your account master key; members hold wrapped copies. Not in this POC (reviewed in
        the wireframes instead): the pairing flow&apos;s &quot;Enable encrypted uploads&quot; step, dataset-page group
        links and the restrict-retrieval dialog, and the Session Keys reverse echo.
      </Notice>

      {selectedGroup ? (
        <GroupDetail
          group={selectedGroup}
          onBack={() => openGroup(null)}
          onStopIssuing={(member) => setStopTarget({ group: selectedGroup.name, member })}
          onAddMember={(key) =>
            setGroups((gs) =>
              gs.map((g) =>
                g.name === selectedGroup.name
                  ? {
                      ...g,
                      members: [
                        ...g.members,
                        {
                          label: "new member",
                          key,
                          kind: "person",
                          added: "today",
                          fetchToken: "none",
                          ownWriteKey: null,
                        },
                      ],
                    }
                  : g,
              ),
            )
          }
        />
      ) : (
        <>
          <div className='flex items-center justify-between'>
            <div>
              <h1 className='text-xl font-semibold'>
                Groups <span className='text-sm font-normal text-muted-foreground'>· read access</span> <MockChip />
              </h1>
              <p className='mt-1 text-sm text-muted-foreground'>
                A group is a named key. Members hold it; everything you or your agents encrypt under the group&apos;s
                name is readable by them — across data sets. One role per member grant.
              </p>
            </div>
            <Button variant='primary' onClick={() => setCreateOpen(true)}>
              Create group
            </Button>
          </div>

          <table className='w-full text-sm'>
            <thead>
              <tr className='border-b text-left text-xs uppercase tracking-wide text-muted-foreground'>
                <th className='py-2 pr-3'>Group</th>
                <th className='py-2 pr-3'>Members</th>
                <th className='py-2 pr-3'>Covers</th>
                <th className='py-2 pr-3'>Created</th>
                <th className='py-2' />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.name} className='border-b'>
                  <td className='py-2 pr-3 font-medium'>{g.name}</td>
                  <td className='py-2 pr-3'>
                    {g.members.length}{" "}
                    <span className='text-xs text-muted-foreground'>({g.members.map((m) => m.label).join(", ")})</span>
                  </td>
                  <td className='py-2 pr-3'>{g.covers}</td>
                  <td className='py-2 pr-3'>{g.created}</td>
                  <td className='py-2 text-right'>
                    <Button variant='ghost' size='compact' onClick={() => openGroup(g.name)}>
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Notice tone='info' title='Where this data lives — and what clearing your browser costs: nothing.'>
            Keys are never stored anywhere: they derive in page memory from your master key, which the wallet re-creates
            on demand. Group records (labels, members, dates) live in a backend issuance service — never browser storage
            — because labels are derivation inputs: lose a used group&apos;s label and the envelope headers of its
            uploaded pieces still recover it; a never-used group&apos;s lost label loses nothing at all. (Backend state
            model: open eng question, PRD §15.)
          </Notice>
        </>
      )}

      <CreateGroupDialog
        onOpenExisting={(name) => openGroup(name)}
        open={createOpen}
        existingNames={groups.map((g) => g.name)}
        onClose={(name) => {
          setCreateOpen(false);
          if (name) {
            setGroups((gs) => [
              ...gs,
              { name, members: [], covers: "0 pieces", restricted: "nothing restricted yet", created: "today" },
            ]);
            openGroup(name);
          }
        }}
      />
      <StopIssuingDialog
        member={stopTarget?.member ?? null}
        onClose={(confirmed) => {
          if (confirmed && stopTarget) {
            setGroups((gs) =>
              gs.map((g) =>
                g.name === stopTarget.group
                  ? { ...g, members: g.members.filter((m) => m.key !== stopTarget.member.key) }
                  : g,
              ),
            );
          }
          setStopTarget(null);
        }}
      />
    </div>
  );
};

export default AccessGroupsSection;
