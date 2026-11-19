"use client";
import { cn } from "@filecoin-pay/ui/lib/utils";
import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { type GroupGrantNode, groupOf, groupPath } from "@/utils/groupKeyGrant";

/** The group a node sits under: the next group up, or the whole group key for a top-level group. */
const parentOf = (node: GroupGrantNode): GroupGrantNode => {
  const group = groupOf(node) ?? "";
  const cut = group.lastIndexOf("/");
  return cut === -1 ? "groupKey" : `group:${group.slice(0, cut)}`;
};

/** A tree row's elbow: a short rule from its parent's guide line into the row. */
const ELBOW =
  "relative before:absolute before:top-4 before:-left-3 before:w-2.5 before:border-t before:border-zinc-200 dark:before:border-zinc-700";

/** How a node reads in the tree: its last name, or "Whole group key". */
const nodeLabel = (node: GroupGrantNode) => groupOf(node)?.split("/").at(-1) ?? "Whole group key";
/** How a node reads in a label or sentence: its full path, or "the whole group key". */
const nodeName = (node: GroupGrantNode) => groupOf(node) ?? "the whole group key";

/** The groups above a requested group, outermost first: shown for context, never selectable. */
const ancestorsOf = (node: GroupGrantNode): GroupGrantNode[] => {
  const names = groupOf(node)?.split("/") ?? [];
  return names.slice(0, -1).map((_, i) => `group:${names.slice(0, i + 1).join("/")}` as const);
};

/**
 * The requested node and the groups the owner added beneath it this visit, as
 * a tree, one row per group name. The requested group and the
 * groups beneath it are radio options: the selected one is what the Grant
 * opens. The groups above a requested group are shown muted, for context
 * only, since the owner may narrow a request but never widen it. No list of
 * existing groups is shown: nothing on chain records them.
 */
export const GroupTree = ({
  root,
  added,
  selected,
  onSelect,
  onAdd,
}: {
  root: GroupGrantNode;
  added: readonly GroupGrantNode[];
  selected: GroupGrantNode;
  onSelect: (node: GroupGrantNode) => void;
  onAdd: (node: GroupGrantNode) => void;
}) => {
  const [adding, setAdding] = useState<GroupGrantNode | null>(null);
  const [segment, setSegment] = useState("");
  const [invalid, setInvalid] = useState(false);
  const ancestors = ancestorsOf(root);
  const close = () => {
    setAdding(null);
    setSegment("");
    setInvalid(false);
  };
  const add = (parent: GroupGrantNode) => {
    const base = groupOf(parent);
    // One name per add: a "/" would add several levels at once.
    const path = segment.includes("/") ? null : groupPath(base === null ? segment : `${base}/${segment}`);
    if (path === null) {
      setInvalid(true);
      return;
    }
    onAdd(`group:${path}`);
    close();
  };
  // An ancestor's only child is the next group down toward the request; anything else, the groups added beneath it.
  const childrenOf = (node: GroupGrantNode): GroupGrantNode[] => {
    const i = ancestors.indexOf(node);
    if (i !== -1) return [ancestors[i + 1] ?? root];
    return added.filter((child) => parentOf(child) === node);
  };

  const row = (node: GroupGrantNode, nested: boolean): ReactNode => {
    const name = nodeName(node);
    const kids = childrenOf(node);
    const selectable = !ancestors.includes(node);
    const labelClass = node === "groupKey" ? "font-medium" : "font-mono text-xs";
    return (
      <li key={node} className={cn(nested && ELBOW)}>
        <div
          className={cn(
            "group flex items-center gap-1 rounded py-0.5 pr-1 pl-1",
            node === selected ? "bg-blue-50 dark:bg-blue-950/40" : selectable && "hover:bg-muted/50",
          )}
        >
          {selectable ? (
            <label className='flex flex-1 cursor-pointer items-center gap-2 py-1 text-sm'>
              <input
                type='radio'
                name='group-key-node'
                value={node}
                aria-label={node === "groupKey" ? "Whole group key" : name}
                checked={node === selected}
                onChange={() => onSelect(node)}
              />
              <span className={labelClass}>{nodeLabel(node)}</span>
            </label>
          ) : (
            <span className={cn("flex-1 py-1 text-muted-foreground", labelClass)}>{nodeLabel(node)}</span>
          )}
          {selectable && (
            <button
              type='button'
              aria-label={`Add a group under ${name}`}
              className='rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground'
              onClick={() => {
                close();
                setAdding(node);
              }}
            >
              <Plus className='size-3.5' aria-hidden='true' />
            </button>
          )}
        </div>
        {(kids.length > 0 || adding === node) && (
          // The guide line: a vertical rule down from this row, with an elbow into each child.
          <ul className='ml-[11px] border-l border-zinc-200 pl-3 dark:border-zinc-700'>
            {kids.map((child) => row(child, true))}
            {adding === node && (
              <li className={cn(ELBOW, "flex flex-col gap-1 py-1 pr-1 pl-1")}>
                <input
                  // biome-ignore lint/a11y/noAutofocus: the input opens on the owner's own click, which expects to type next
                  autoFocus
                  type='text'
                  aria-label={`New group under ${name}`}
                  aria-invalid={invalid}
                  aria-describedby={invalid ? "group-key-new-error" : undefined}
                  placeholder='group-name'
                  value={segment}
                  onChange={(event) => {
                    setSegment(event.target.value);
                    setInvalid(false);
                  }}
                  onBlur={close}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      add(node);
                    }
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      close();
                    }
                  }}
                  className='h-7 rounded border bg-transparent px-2 font-mono text-xs'
                />
                {invalid && (
                  <span id='group-key-new-error' className='text-xs text-destructive'>
                    Not a valid group name: it must be non-empty, with no "/" and no space at the start or end.
                  </span>
                )}
              </li>
            )}
          </ul>
        )}
      </li>
    );
  };

  return (
    <fieldset className='mt-2'>
      <legend className='text-xs text-muted-foreground'>Choose the group to share, or add one beneath it</legend>
      <ul className='mt-1 rounded-lg border border-zinc-200 p-2 dark:border-zinc-700'>
        {row(ancestors[0] ?? root, false)}
      </ul>
    </fieldset>
  );
};
