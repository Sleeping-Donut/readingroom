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
			<h3 class="mb-4 text-lg font-semibold">Account</h3>
			<Show
				when={authEnabled()}
				fallback={<p class="text-sm text-gray-500">Authentication is disabled.</p>}
			>
				<div class="max-w-md space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-4">
					<div>
						<label class="mb-1 block text-xs text-gray-400">Username</label>
						<p class="text-sm">{user()?.username ?? "unknown"}</p>
					</div>
					<div>
						<label class="mb-1 block text-xs text-gray-400">Current Password</label>
						<input
							type="password"
							value={currentPassword()}
							onInput={(e) => setCurrentPassword(e.currentTarget.value)}
							class="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
							autocomplete="current-password"
						/>
					</div>
					<div>
						<label class="mb-1 block text-xs text-gray-400">New Password</label>
						<input
							type="password"
							value={newPassword()}
							onInput={(e) => setNewPassword(e.currentTarget.value)}
							class="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
							autocomplete="new-password"
						/>
					</div>
					<div>
						<label class="mb-1 block text-xs text-gray-400">Confirm New Password</label>
						<input
							type="password"
							value={confirmPassword()}
							onInput={(e) => setConfirmPassword(e.currentTarget.value)}
							class="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
							autocomplete="new-password"
						/>
					</div>
					<Show when={error()}>
						<p class="text-sm text-red-400">{error()}</p>
					</Show>
					<Show when={success()}>
						<p class="text-sm text-green-400">Password updated.</p>
					</Show>
					<button
						onClick={() => void submit()}
						disabled={
							submitting() ||
							!currentPassword() ||
							!newPassword() ||
							!!passwordError()
						}
						class="rounded bg-indigo-600 px-4 py-2 text-sm transition-colors hover:bg-indigo-500 disabled:bg-gray-600"
					>
						{submitting() ? "Updating..." : "Update Password"}
					</button>
				</div>
			</Show>
		</div>
	);
}
