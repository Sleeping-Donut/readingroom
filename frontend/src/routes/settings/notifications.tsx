import { Title } from "@solidjs/meta";
import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { createMemo, createSignal, createStore, Errored, For, Loading, Show } from "solid-js";

import * as settingsApi from "../../api/settings";
import { AddNotificationForm } from "../../components/settings/notifications/AddNotificationForm";
import { NotificationCard } from "../../components/settings/notifications/NotificationCard";
import {
	createNotifications,
	draftFor,
	toInput,
	validateDraft,
	type Draft,
} from "../../resources/notifications";

export const route = defineFileRoute("/settings/notifications", {
	info: { label: "Notifications" },
	preload: () => {
		void settingsApi.listNotifications();
	},
});

export default function NotificationsTab(_props: RouteProps<typeof route>) {
	const [
		notifications,
		{ addNotification, removeNotification, retryRemoveNotification, testNotification },
	] = createNotifications();

	// Add flow.
	const [showAdd, setShowAdd] = createSignal(false);
	const [draft, setDraft] = createStore<Draft>(draftFor());
	const [submitting, setSubmitting] = createSignal(false);
	const [actionError, setActionError] = createSignal<string | null>(null);

	const valid = createMemo(() => validateDraft(draft).success);

	const submitAdd = async () => {
		const parsed = validateDraft(draft);
		if (!parsed.success) {
			setActionError(parsed.error);
			return;
		}
		setSubmitting(true);
		setActionError(null);
		try {
			await addNotification(toInput(draft));
			setShowAdd(false);
			setDraft(() => draftFor());
		} catch (e) {
			setActionError(e instanceof Error ? e.message : "Request failed");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div>
			<Title>Notifications · Settings · ReadingRoom</Title>
			<Errored
				fallback={(err, reset) => (
					<p class="mt-2 text-sm text-bad">
						Failed to load: {String(err())}{" "}
						<button onClick={reset} class="ml-1 text-accent underline">
							Retry
						</button>
					</p>
				)}
			>
				<Loading fallback={<p class="text-ink-500">Loading...</p>}>
					<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
						<h3 class="font-display text-2xl text-ink-900">Notifications</h3>
						<button
							onClick={() => setShowAdd(!showAdd())}
							class="rounded bg-ink-900 px-3 py-1.5 text-sm transition-colors hover:bg-ink-700"
						>
							{showAdd() ? "Cancel" : "Add Notification"}
						</button>
					</div>

					<Show when={actionError()}>
						<p class="mt-2 text-sm text-bad">{actionError()}</p>
					</Show>

					<Show when={showAdd()}>
						<AddNotificationForm
							draft={draft}
							setDraft={setDraft}
							submitting={submitting()}
							valid={valid()}
							onSave={() => void submitAdd()}
							onCancel={() => setShowAdd(false)}
						/>
					</Show>

					<Show
						when={notifications.notifications.length > 0}
						fallback={<p class="text-sm text-ink-500">No notifications configured.</p>}
					>
						<div class="space-y-2">
							<For each={notifications.notifications}>
								{(notif) => (
									<NotificationCard
										notif={notif}
										onTest={() => void testNotification(notif.id)}
										onRemove={() => void removeNotification(notif)}
										onRetry={() => void retryRemoveNotification(notif.id)}
									/>
								)}
							</For>
						</div>
					</Show>
				</Loading>
			</Errored>
		</div>
	);
}
