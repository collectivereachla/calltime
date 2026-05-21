"use client";

import { useState, useTransition } from "react";
import { updateProfile, changePassword } from "./actions";

interface Person {
  id: string;
  full_name: string;
  preferred_name: string | null;
  pronouns: string | null;
  email: string | null;
  phone: string | null;
  bio: string | null;
  birth_month: number | null;
  birth_day: number | null;
  is_minor: boolean;
}

export function SettingsForm({
  person,
  userEmail,
}: {
  person: Person;
  userEmail: string;
}) {
  const [profileMsg, setProfileMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [pendingProfile, startProfile] = useTransition();
  const [pendingPassword, startPassword] = useTransition();

  function handleProfileSubmit(formData: FormData) {
    setProfileMsg(null);
    startProfile(async () => {
      const result = await updateProfile(formData);
      if (result.error) {
        setProfileMsg({ type: "error", text: result.error });
      } else {
        setProfileMsg({ type: "success", text: "Profile updated." });
      }
    });
  }

  function handlePasswordSubmit(formData: FormData) {
    setPasswordMsg(null);
    startPassword(async () => {
      const result = await changePassword(formData);
      if (result.error) {
        setPasswordMsg({ type: "error", text: result.error });
      } else {
        setPasswordMsg({ type: "success", text: "Password changed." });
        // Clear the form
        const form = document.getElementById(
          "password-form"
        ) as HTMLFormElement;
        form?.reset();
      }
    });
  }

  return (
    <div className="space-y-10">
      {/* Profile section */}
      <section>
        <h2 className="text-body-md font-medium text-ink mb-4">Profile</h2>
        <form
          action={handleProfileSubmit}
          className="bg-card border border-bone rounded-card p-6 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Full name"
              name="full_name"
              defaultValue={person.full_name}
              required
            />
            <Field
              label="Preferred name"
              name="preferred_name"
              defaultValue={person.preferred_name || ""}
              placeholder="What should we call you?"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Email"
              name="email"
              type="email"
              defaultValue={person.email || userEmail}
            />
            <Field
              label="Phone"
              name="phone"
              type="tel"
              defaultValue={person.phone || ""}
              placeholder="(555) 555-5555"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Pronouns"
              name="pronouns"
              defaultValue={person.pronouns || ""}
              placeholder="e.g. he/him, she/her, they/them"
            />
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Birth month"
                name="birth_month"
                type="number"
                defaultValue={person.birth_month?.toString() || ""}
                placeholder="MM"
                min={1}
                max={12}
              />
              <Field
                label="Birth day"
                name="birth_day"
                type="number"
                defaultValue={person.birth_day?.toString() || ""}
                placeholder="DD"
                min={1}
                max={31}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="bio"
              className="block text-body-sm text-ash mb-1.5"
            >
              Bio
            </label>
            <textarea
              id="bio"
              name="bio"
              defaultValue={person.bio || ""}
              rows={3}
              placeholder="A short bio for the program or company page"
              className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors resize-none"
            />
          </div>

          {profileMsg && (
            <div
              className={`text-body-sm rounded-card px-4 py-3 ${
                profileMsg.type === "success"
                  ? "text-confirmed bg-confirmed/5 border border-confirmed/20"
                  : "text-brick bg-brick/5 border border-brick/20"
              }`}
            >
              {profileMsg.text}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pendingProfile}
              className="px-5 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50"
            >
              {pendingProfile ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </section>

      {/* Password section */}
      <section>
        <h2 className="text-body-md font-medium text-ink mb-4">
          Change password
        </h2>
        <form
          id="password-form"
          action={handlePasswordSubmit}
          className="bg-card border border-bone rounded-card p-6 space-y-4"
        >
          <Field
            label="New password"
            name="new_password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />
          <Field
            label="Confirm password"
            name="confirm_password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Type it again"
          />

          {passwordMsg && (
            <div
              className={`text-body-sm rounded-card px-4 py-3 ${
                passwordMsg.type === "success"
                  ? "text-confirmed bg-confirmed/5 border border-confirmed/20"
                  : "text-brick bg-brick/5 border border-brick/20"
              }`}
            >
              {passwordMsg.text}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pendingPassword}
              className="px-5 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-50"
            >
              {pendingPassword ? "Updating..." : "Change password"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

// Simple field component to reduce repetition
function Field({
  label,
  name,
  type = "text",
  defaultValue = "",
  placeholder,
  required,
  minLength,
  autoComplete,
  min,
  max,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-body-sm text-ash mb-1.5">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        min={min}
        max={max}
        className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
      />
    </div>
  );
}
