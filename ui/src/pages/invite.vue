<template>
  <div class="flex justify-center items-center min-h-[60vh] px-4">
    <div class="w-full max-w-md text-center space-y-5">
      <div v-if="state === 'checking'" class="py-10">
        <VaInnerLoading loading class="w-full">
          <div class="h-24" />
        </VaInnerLoading>
        <p class="text-sm va-text-secondary">Checking your invitation…</p>
      </div>

      <template v-else-if="state === 'invalid'">
        <i-mdi-link-variant-off class="text-5xl mx-auto text-gray-400" />
        <h1 class="text-xl font-semibold">
          This invitation is no longer valid
        </h1>
        <p class="text-sm va-text-secondary">
          It may have been used, withdrawn, or it may have expired. Ask whoever
          invited you to send a new one.
        </p>
        <VaButton to="/">Go to the portal</VaButton>
      </template>

      <template v-else-if="state === 'wrong-account'">
        <i-mdi-account-alert-outline class="text-5xl mx-auto text-amber-500" />
        <h1 class="text-xl font-semibold">
          This invitation was sent to a different email address
        </h1>
        <!-- Which address is not shown. Whoever is holding this link is not the person it
             was sent to, and telling them the address would hand it to them. -->
        <p class="text-sm va-text-secondary">
          You are signed in as {{ auth.user?.email }}. Sign in with the account
          the invitation was sent to, then open the link again.
        </p>
        <div class="flex gap-3 justify-center">
          <VaButton preset="secondary" to="/auth/logout"
            >Sign in as someone else</VaButton
          >
          <VaButton to="/">Go to the portal</VaButton>
        </div>
      </template>

      <!--
        The signed-out stop. Landing straight on a sign-in form asks someone to authenticate
        with no idea why, which reads like a phishing page. This says who invited them, what
        signing in will do, and that nothing has happened yet.
      -->
      <template v-else-if="state === 'signed-out'">
        <i-mdi-email-open-outline class="text-5xl mx-auto text-blue-600" />
        <h1 class="text-xl font-semibold">
          You've been invited to join
          <span v-if="groupName">{{ groupName }}</span>
          <span v-else>a group</span>
        </h1>
        <p class="text-sm va-text-secondary">
          Sign in to accept. Nothing has changed yet, and you can close this
          page without joining.
        </p>

        <ol
          class="text-left text-sm space-y-2 rounded-lg bg-gray-50 p-4 dark:bg-gray-800"
        >
          <li class="flex gap-2.5">
            <span :class="STEP">1</span>
            <span>Sign in, or create an account if you do not have one.</span>
          </li>
          <li class="flex gap-2.5">
            <span :class="STEP">2</span>
            <!-- Which address is not shown, for the same reason the wrong-account state
                 does not show it: whoever holds a forwarded link is not the recipient. -->
            <span>Use the email address this invitation was sent to.</span>
          </li>
          <li class="flex gap-2.5">
            <span :class="STEP">3</span>
            <span
              >You are added to the group and brought straight back here.</span
            >
          </li>
        </ol>

        <div class="flex gap-3 justify-center">
          <VaButton @click="signIn">Sign in to continue</VaButton>
          <VaButton preset="secondary" to="/">Not now</VaButton>
        </div>
      </template>

      <template v-else-if="state === 'joined'">
        <i-mdi-check-circle-outline class="text-5xl mx-auto text-emerald-500" />
        <h1 class="text-xl font-semibold">
          You've been added to {{ groupName }}
        </h1>
        <VaButton :to="groupId ? `/v2/groups/${groupId}` : '/'">
          {{ groupId ? "Open the group" : "Go to the portal" }}
        </VaButton>
      </template>

      <template v-else-if="state === 'failed'">
        <i-mdi-alert-circle-outline class="text-5xl mx-auto text-red-500" />
        <h1 class="text-xl font-semibold">Could not join the group</h1>
        <p class="text-sm va-text-secondary">
          Something went wrong on our side. Your invitation is still valid.
        </p>
        <VaButton :loading="retrying" @click="accept">Try again</VaButton>
      </template>
    </div>
  </div>
</template>

<script setup>
import authService from "@/services/auth";
import { normalizeEmail } from "@/services/email";
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const state = ref("checking");
const groupName = ref("");

// The step number badge, written out so Tailwind's scanner sees a complete class string.
const STEP =
  "flex-none grid place-items-center w-5 h-5 rounded-full bg-blue-600 " +
  "text-white text-2xs font-semibold";
const groupId = ref("");
const retrying = ref(false);
// Held here rather than read back from the URL, which is cleared on mount.
let token = "";

// Sending them on is unconditional: asking whether this address already has an account
// would answer that question for anyone holding a link.
function signIn() {
  router.push("/auth");
}

async function accept() {
  retrying.value = true;
  try {
    const { data } = await authService.applyInvite(token);
    groupName.value = data.group_name;
    groupId.value = data.group_id;
    state.value = "joined";
    auth.clearInviteData();
  } catch (err) {
    const status = err?.response?.status;
    if (status === 403) {
      state.value = "wrong-account";
    } else if ([404, 409].includes(status)) {
      state.value = "invalid";
      auth.clearInviteData();
    } else {
      // Transient. The token is kept so "Try again" has something to send.
      state.value = "failed";
    }
  } finally {
    retrying.value = false;
  }
}

onMounted(async () => {
  token = route.query.token || "";

  // Before anything else on the page can fire a request. This drops the token from the
  // browser's current history entry and keeps it out of the Referer header sent to any
  // third-party resource the page loads.
  if (route.query.token) {
    await router.replace({ query: {} });
  }

  if (!token) {
    state.value = "invalid";
    return;
  }

  let check;
  try {
    check = (await authService.checkInvite(token)).data;
  } catch (err) {
    console.error("Could not check the invitation", err);
    state.value = "failed";
    return;
  }

  if (check.status !== "valid") {
    state.value = "invalid";
    return;
  }

  if (!auth.loggedIn) {
    // Held now rather than on the button, so the invitation still applies if they sign in
    // by some other route before coming back.
    auth.inviteToken = token;
    // Named so the interstitial can say which group, which `/check` already returned. The
    // invited address is deliberately not shown.
    groupName.value = check.group_name || "";
    state.value = "signed-out";
    return;
  }

  if (normalizeEmail(auth.user?.email) !== normalizeEmail(check.email)) {
    // Compared here only to avoid a pointless round trip and a confusing error. The server
    // makes the same comparison, better, and its answer is the one that counts.
    state.value = "wrong-account";
    return;
  }

  await accept();
});
</script>

<route lang="yaml">
meta:
  layout: auth
  title: Invitation
  requiresAuth: false
</route>
