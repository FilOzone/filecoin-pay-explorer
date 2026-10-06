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

type MockMember = {
  label: string;
  key: string;
  kind: "agent" | "person";
  added: string;
  canWrite: boolean;
};

type MockGroup = {
  name: string;
  members: MockMember[];
  covers: string;
  created: string;
};

const INITIAL_GROUPS: MockGroup[] = [
  {
    name: "research-partners",
    created: "Sep 28",
    covers: "500 pieces · 4 data sets",
    members: [
      { label: "build agent", key: "0x02b7f4…9e2c", kind: "agent", added: "Sep 28", canWrite: true },
      { label: "anna (research)", key: "0x03d19a…44F0", kind: "person", added: "Sep 28", canWrite: false },
      { label: "reviewer (external)", key: "0x0e77c2…1ab4", kind: "person", added: "Oct 05", canWrite: false },
    ],
  },
  {
    name: "finance",
    created: "Oct 02",
    covers: "12 pieces · 1 data set",
    members: [{ label: "cfo laptop", key: "0x9b4410…caa2", kind: "person", added: "Oct 02", canWrite: false }],
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
        <Button variant='primary' className='bg-red-600 hover:bg-red-700' onClick={() => onClose(true)}>
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
}: {
  open: boolean;
  existingNames: string[];
  onClose: (name: string | null) => void;
}) => {
  const [name, setName] = useState("");
  const isReuse = existingNames.includes(name.trim());
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create access group</DialogTitle>
          <DialogDescription>
            A group is a named key. Everything you or your agents encrypt under the group&apos;s name is readable by its
            members — across data sets. Pick a unique, specific name.
          </DialogDescription>
        </DialogHeader>
        <input
          type='text'
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='group name — e.g. research-partners-2026'
          className='w-full rounded-lg border px-3 py-2 font-mono text-sm'
        />
        {isReuse && (
          <Notice tone='warn' title={`"${name.trim()}" already exists.`}>
            Creating it again would re-create the same key — everyone who ever held it would read the new data. Add
            members to the existing group instead, or pick a different name. (Best-effort check: the console can only
            see groups with uploaded data or console records.)
          </Notice>
        )}
        <DialogFooter>
          <Button variant='ghost' onClick={() => onClose(null)}>
            Cancel
          </Button>
          <Button variant='primary' disabled={name.trim() === "" || isReuse} onClick={() => onClose(name.trim())}>
            Create — sign with wallet
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

      <table className='w-full text-sm'>
        <thead>
          <tr className='border-b text-left text-xs uppercase tracking-wide text-muted-foreground'>
            <th className='py-2 pr-3'>Member</th>
            <th className='py-2 pr-3'>Key</th>
            <th className='py-2 pr-3'>Kind</th>
            <th className='py-2 pr-3'>Added</th>
            <th className='py-2 pr-3'>Can write?</th>
            <th className='py-2' />
          </tr>
        </thead>
        <tbody>
          {group.members.map((m) => (
            <tr key={m.key} className='border-b'>
              <td className='py-2 pr-3 font-medium'>{m.label}</td>
              <td className='py-2 pr-3 font-mono text-xs'>{m.key}</td>
              <td className='py-2 pr-3'>
                <KindPill kind={m.kind} />
              </td>
              <td className='py-2 pr-3'>{m.added}</td>
              <td className='py-2 pr-3 text-xs'>
                {m.canWrite ? (
                  <span>
                    <b>yes</b> — also holds an addPieces session key
                  </span>
                ) : (
                  "read only"
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
            disabled={memberKey.trim() === ""}
            onClick={() => {
              onAddMember(memberKey.trim());
              setMemberKey("");
            }}
          >
            Add — sign with wallet
          </Button>
          <span className='text-xs text-muted-foreground'>
            one re-derive in page memory; the group key wraps to the new member; nothing on chain
          </span>
        </div>
      </div>

      <Notice tone='warn' title='"Stop issuing" is membership-going-forward, not revocation.'>
        Anyone who held the key keeps reading existing data. Real revocation = stop issuing + cycle (epoch bump →
        re-encrypt → re-upload → new links) — cycling execution is deferred in v1.
      </Notice>
      <Notice tone='info' title='Group key holders read everything under this name, across data sets.'>
        Write is separate: writing also requires an addPieces session key — a SessionKeyRegistry grant, managed under
        Session Keys. A member row saying &quot;yes&quot; just means the same identity also holds one.
      </Notice>
    </div>
  );
};

const AccessGroupsSection = () => {
  const [groups, setGroups] = useState<MockGroup[]>(INITIAL_GROUPS);
  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [stopTarget, setStopTarget] = useState<{ group: string; member: MockMember } | null>(null);

  const selectedGroup = groups.find((g) => g.name === selected);

  return (
    <div className='flex flex-col gap-4'>
      <Notice tone='warn' title='Mock preview — nothing on this page is real.'>
        Fabricated data, no keys, no chain, no backend. POC for the encryption group model (PRD rev 2026-10-06): a group
        is a named key derived from your account master key; members hold wrapped copies.
      </Notice>

      {selectedGroup ? (
        <GroupDetail
          group={selectedGroup}
          onBack={() => setSelected(null)}
          onStopIssuing={(member) => setStopTarget({ group: selectedGroup.name, member })}
          onAddMember={(key) =>
            setGroups((gs) =>
              gs.map((g) =>
                g.name === selectedGroup.name
                  ? {
                      ...g,
                      members: [
                        ...g.members,
                        { label: "new member", key, kind: "person", added: "today", canWrite: false },
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
                    <Button variant='ghost' size='compact' onClick={() => setSelected(g.name)}>
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Notice tone='info' title='Where this data lives:'>
            Membership rows are console bookkeeping (labels, dates) — the capability is the wrapped key already
            delivered. The console derives group keys in page memory from your master key; it stores no key material.
            (Backend state model: open eng question, PRD §15.)
          </Notice>
        </>
      )}

      <CreateGroupDialog
        open={createOpen}
        existingNames={groups.map((g) => g.name)}
        onClose={(name) => {
          setCreateOpen(false);
          if (name) {
            setGroups((gs) => [...gs, { name, members: [], covers: "0 pieces", created: "today" }]);
            setSelected(name);
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
