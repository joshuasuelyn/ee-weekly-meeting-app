import { signOut } from "@/app/login/actions";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="text-(--color-muted) hover:text-(--color-ink) underline underline-offset-2"
      >
        Sign out
      </button>
    </form>
  );
}
