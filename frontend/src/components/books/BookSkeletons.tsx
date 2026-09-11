import { For, Show } from "solid-js";

import { Skeleton } from "../ui/Skeleton";

const LIST_ROWS = 6;
const GRID_CARDS = 10;
const EDITION_ROWS = 5;

function ListSkeleton(props: { count: number }) {
	return (
		<div class="space-y-2">
			<For each={Array.from({ length: props.count })}>
				{() => (
					<div class="flex items-center gap-4 rounded-sm border border-rule bg-paper-100 p-3">
						<Skeleton class="h-14 w-10 shrink-0 rounded" />
						<div class="min-w-0 flex-1">
							<Skeleton class="h-5 w-2/5" />
							<Skeleton class="mt-2 h-3 w-1/4" />
							<Skeleton class="mt-2 h-3 w-20" />
						</div>
					</div>
				)}
			</For>
		</div>
	);
}

function GridSkeleton(props: { count: number }) {
	return (
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
			<For each={Array.from({ length: props.count })}>
				{() => (
					<div class="rounded-sm border border-rule bg-paper-100 p-3">
						<Skeleton class="mb-3 aspect-[2/3] w-full rounded" />
						<Skeleton class="h-5 w-3/4" />
						<Skeleton class="mt-2 h-3 w-1/2" />
					</div>
				)}
			</For>
		</div>
	);
}

/// Loading placeholder for a list/grid of book rows, matching the real layout.
export function BookListSkeleton(props: { view?: "grid" | "list"; count?: number }) {
	return (
		<Show
			when={props.view === "grid"}
			fallback={<ListSkeleton count={props.count ?? LIST_ROWS} />}
		>
			<GridSkeleton count={props.count ?? GRID_CARDS} />
		</Show>
	);
}

/// Loading placeholder for the book detail header: cover plus metadata lines.
export function BookDetailSkeleton(props: { withHeader?: boolean }) {
	return (
		<div class="mt-4 flex flex-col gap-6 sm:flex-row sm:gap-8">
			<Skeleton class="aspect-[2/3] w-40 shrink-0 self-start rounded-sm sm:w-48" />
			<div class="min-w-0 flex-1">
				<Show when={props.withHeader}>
					<Skeleton class="h-9 w-2/3" />
					<Skeleton class="mt-2 h-5 w-1/3" />
				</Show>
				<div class="mt-4 max-w-md space-y-3">
					<For each={Array.from({ length: 5 })}>
						{() => <Skeleton class="h-4 w-full" />}
					</For>
				</div>
			</div>
		</div>
	);
}

/// Loading placeholder for a list of edition rows (cover + two text lines).
export function EditionListSkeleton(props: { count?: number }) {
	return (
		<section class="mt-8 max-w-3xl">
			<div class="mb-4 flex items-center justify-between gap-3">
				<Skeleton class="h-6 w-40" />
				<Skeleton class="h-4 w-12" />
			</div>
			<div class="space-y-2">
				<For each={Array.from({ length: props.count ?? EDITION_ROWS })}>
					{() => (
						<div class="flex gap-3 rounded-sm border border-rule bg-paper-100 p-3">
							<Skeleton class="h-16 w-11 shrink-0 rounded" />
							<div class="min-w-0 flex-1">
								<Skeleton class="h-5 w-1/3" />
								<Skeleton class="mt-2 h-3 w-1/2" />
							</div>
						</div>
					)}
				</For>
			</div>
		</section>
	);
}
