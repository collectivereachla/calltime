import type { DesignRoomConfig } from "./design-room";

const SHARED_STATUS = {
  concept: { label: "Concept", color: "bg-ash/10 text-ash" },
  designed: { label: "Designed", color: "bg-tentative/10 text-tentative" },
  in_build: { label: "In Progress", color: "bg-brick/10 text-brick" },
  complete: { label: "Complete", color: "bg-confirmed/10 text-confirmed" },
  cut: { label: "Cut", color: "bg-muted/20 text-muted line-through" },
};

const CUE_STATUS = {
  concept: { label: "Concept", color: "bg-ash/10 text-ash" },
  written: { label: "Written", color: "bg-tentative/10 text-tentative" },
  programmed: { label: "Programmed", color: "bg-brick/10 text-brick" },
  set: { label: "Set", color: "bg-confirmed/10 text-confirmed" },
};

export function makeLightingConfig(designerName: string | null, designerRole: string | null): DesignRoomConfig {
  return {
    department: "lights",
    departmentLabel: "Lights",
    designerName,
    designerRole,
    cuePrefix: "LX",
    cueLabel: "Cue",
    cueLabelPlural: "Cues",
    cueMetaFields: [
      { key: "intensity", label: "Intensity", placeholder: "Full / 80% / Bump" },
      { key: "color", label: "Color", placeholder: "R02 / L201 / Warm wash" },
      { key: "area", label: "Focus Area", placeholder: "DSC / Full stage / SR pool" },
    ],
    elementLabel: "Instrument",
    elementLabelPlural: "Instruments",
    elementPlaceholder: "e.g. Source Four 36°, PAR 64, LED strip",
    elementDescPlaceholder: "Position, channel, dimmer, color, purpose...",
    elementMetaFields: [
      { key: "channel", label: "Channel", placeholder: "Ch 12" },
      { key: "dimmer", label: "Dimmer", placeholder: "D 24" },
      { key: "gel", label: "Gel/Color", placeholder: "R02" },
    ],
    referenceCategories: [
      { value: "light_plot", label: "Light Plot" },
      { value: "channel_hookup", label: "Channel Hookup" },
      { value: "magic_sheet", label: "Magic Sheet" },
      { value: "reference", label: "Reference / Inspiration" },
      { value: "mood_board", label: "Mood Board" },
      { value: "photo", label: "Photo" },
      { value: "technical", label: "Technical Drawing" },
    ],
    statusLabels: SHARED_STATUS,
    cueStatusLabels: CUE_STATUS,
    guidance: [
      'Start with the <strong class="text-ink">Scene Breakdown</strong>. For each scene, describe the quality of light — time of day, mood, temperature, motivation. What is the light <em>doing</em> in this moment?',
      'Build your <strong class="text-ink">Cue List</strong> from those notes. Every cue needs a number, a trigger (what tells the SM to call "Go"), and a description of what changes. Think in terms of looks and transitions.',
      'Track your <strong class="text-ink">Instruments</strong> — what\'s hanging where, what channel, what color. This becomes your channel hookup.',
      'Upload your <strong class="text-ink">Light Plot</strong> and <strong class="text-ink">Magic Sheet</strong> as references so the whole team can see the plan.',
    ],
  };
}

export function makeSoundConfig(designerName: string | null, designerRole: string | null): DesignRoomConfig {
  return {
    department: "sound",
    departmentLabel: "Sound",
    designerName,
    designerRole,
    cuePrefix: "SQ",
    cueLabel: "Cue",
    cueLabelPlural: "Cues",
    cueMetaFields: [
      { key: "source", label: "Source / Track", placeholder: "rain_loop.wav / Spotify link" },
      { key: "volume", label: "Volume", placeholder: "-12dB / Medium / Under dialogue" },
      { key: "output", label: "Output", placeholder: "Main L/R / Monitor 3 / Sub" },
    ],
    elementLabel: "Source",
    elementLabelPlural: "Sources",
    elementPlaceholder: "e.g. Rain ambience, Transition sting, Crowd murmur",
    elementDescPlaceholder: "File name, duration, where sourced, license...",
    elementMetaFields: [
      { key: "duration", label: "Duration", placeholder: "0:45 loop" },
      { key: "file", label: "File", placeholder: "rain_01.wav" },
    ],
    referenceCategories: [
      { value: "sound_plot", label: "Sound Plot" },
      { value: "speaker_plot", label: "Speaker Plot" },
      { value: "source_music", label: "Source Music Reference" },
      { value: "reference", label: "Reference / Inspiration" },
      { value: "mood_board", label: "Mood Board" },
      { value: "technical", label: "Technical Drawing" },
    ],
    statusLabels: {
      concept: { label: "Concept", color: "bg-ash/10 text-ash" },
      designed: { label: "Sourced", color: "bg-tentative/10 text-tentative" },
      in_build: { label: "In Edit", color: "bg-brick/10 text-brick" },
      complete: { label: "Complete", color: "bg-confirmed/10 text-confirmed" },
      cut: { label: "Cut", color: "bg-muted/20 text-muted line-through" },
    },
    cueStatusLabels: CUE_STATUS,
    guidance: [
      'Start with the <strong class="text-ink">Scene Breakdown</strong>. For each scene, describe the sound world — what does this place sound like? Is there silence, and is that silence intentional? What\'s the emotional temperature?',
      'Build your <strong class="text-ink">Cue List</strong> from those notes. Every cue has a trigger and a purpose — pre-show, transitions, underscoring, effects, source music. Number them in order.',
      'Catalog your <strong class="text-ink">Sources</strong> — sound effects, music tracks, ambiences. Where did they come from? How long are they? Are they licensed?',
      'Upload your <strong class="text-ink">Sound Plot</strong> and <strong class="text-ink">Speaker Plot</strong> as references. If Mitch is running the board, he needs to see the system design.',
    ],
  };
}
