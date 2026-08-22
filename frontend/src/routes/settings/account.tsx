import { Title } from "@solidjs/meta";
import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { action, createMemo, createSignal, Show } from "solid-js";

import { user, authEnabled, changePassword } from "../../api/auth";

export const route = defineFileRoute("/settings/account", {
	info: { label: "Account" },
});

export default function AccountTab(_props: RouteProps<typeof route>) {
	const [currentPassword, setCurrentPassword] = createSignal("");
	const [newPassword, setNewPassword] = createSignal("");
	const [confirmPassword, setConfirmPassword] = createSignal("");
	const [submitting, setSubmitting] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const [success, setSuccess] = createSignal(false);

	const passwordError = createMemo(() => {
		const np = newPassword();
		if (np && np.length < 8) return "New password must be at least 8 characters";
		if (confirmPassword() && np !== confirmPassword()) return "Passwords do not match";
		return null;
	});

	const submit = action(async function* () {
		setError(null);
		setSuccess(false);
		if (passwordError()) {
			setError(passwordError());
			return;
		}
		setSubmitting(true);
		try {
			await changePassword(currentPassword(), newPassword());
			yield;
			setSuccess(true);
			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Request failed");
		} finally {
			setSubmitting(false);
		}
	});

	return (
		<div>
			<Title>Account · Settings · ReadingRoom</Title>
			<h3 class="mb-4 font-display text-2xl text-ink-900">Account</h3>
			<Show
				when={authEnabled()}
				fallback={<p class="text-sm text-ink-500">Authentication is disabled.</p>}
			>
				<div class="max-w-md space-y-3 rounded-lg border border-rule bg-paper-100 p-4">
					<div>
						<label class="mb-1 block text-xs text-ink-700">Username</label>
						<p class="text-sm">{user()?.username ?? "unknown"}</p>
					</div>
					<div>
						<label
							for="account-current-password"
							class="mb-1 block text-xs text-ink-700"
						>
							Current Password
						</label>
						<input
							id="account-current-password"
							type="password"
							value={currentPassword()}
							onInput={(e) => setCurrentPassword(e.currentTarget.value)}
							class="w-full rounded border border-rule bg-paper-200 px-3 py-2 text-sm"
							autocomplete="current-password"
						/>
					</div>
					<div>
						<label for="account-new-password" class="mb-1 block text-xs text-ink-700">
							New Password
						</label>
						<input
							id="account-new-password"
							type="password"
							value={newPassword()}
							onInput={(e) => setNewPassword(e.currentTarget.value)}
							class="w-full rounded border border-rule bg-paper-200 px-3 py-2 text-sm"
							autocomplete="new-password"
						/>
					</div>
					<div>
						<label
							for="account-confirm-password"
							class="mb-1 block text-xs text-ink-700"
						>
							Confirm New Password
						</label>
						<input
							id="account-confirm-password"
							type="password"
							value={confirmPassword()}
							onInput={(e) => setConfirmPassword(e.currentTarget.value)}
							class="w-full rounded border border-rule bg-paper-200 px-3 py-2 text-sm"
							autocomplete="new-password"
						/>
					</div>
					<Show when={error()}>
						<p class="text-sm text-bad">{error()}</p>
					</Show>
					<Show when={success()}>
						<p class="text-sm text-good">Password updated.</p>
					</Show>
					<button
						onClick={() => void submit()}
						disabled={
							submitting() ||
							!currentPassword() ||
							!newPassword() ||
							!!passwordError()
						}
						class="rounded bg-ink-900 px-4 py-2 text-sm transition-colors hover:bg-ink-700 disabled:opacity-50"
					>
						{submitting() ? "Updating..." : "Update Password"}
					</button>
				</div>
			</Show>
		</div>
	);
}
