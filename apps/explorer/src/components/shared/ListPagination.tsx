import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@filecoin-pay/ui/components/pagination";

/**
 * A list pages two ways, and only the total distinguishes them. A list that
 * knows its row count numbers its pages; one without a count can only say
 * whether another page came back, so it steps rather than numbers.
 */
type ListPaginationProps = {
  page: number;
  onPageChange: (page: number) => void;
} & ({ kind: "counted"; totalPages: number } | { kind: "stepped"; hasMore: boolean });

/** How many numbered links to show around the current page. */
const MAX_PAGE_LINKS = 5;

/** Up to `MAX_PAGE_LINKS` page numbers centred on `page`, shifted to stay within the first and last page. */
function pageWindow(page: number, totalPages: number): number[] {
  const count = Math.min(MAX_PAGE_LINKS, totalPages);
  const first = Math.min(Math.max(1, page - Math.floor(MAX_PAGE_LINKS / 2)), totalPages - count + 1);
  return Array.from({ length: count }, (_, index) => first + index);
}

const stepClass = (isDisabled: boolean) => (isDisabled ? "pointer-events-none opacity-50" : "cursor-pointer");

export function ListPagination(props: ListPaginationProps) {
  const { page, onPageChange } = props;

  const isFirst = page === 1;
  const isLast = props.kind === "counted" ? page >= props.totalPages : !props.hasMore;
  const nextPage = props.kind === "counted" ? Math.min(props.totalPages, page + 1) : page + 1;

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious onClick={() => onPageChange(Math.max(1, page - 1))} className={stepClass(isFirst)} />
        </PaginationItem>

        {props.kind === "counted"
          ? pageWindow(page, props.totalPages).map((pageNumber) => (
              <PaginationItem key={pageNumber}>
                <PaginationLink
                  onClick={() => onPageChange(pageNumber)}
                  isActive={page === pageNumber}
                  className='cursor-pointer'
                >
                  {pageNumber}
                </PaginationLink>
              </PaginationItem>
            ))
          : null}

        <PaginationItem>
          <PaginationNext onClick={() => onPageChange(nextPage)} className={stepClass(isLast)} />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
