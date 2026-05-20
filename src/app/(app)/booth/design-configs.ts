import type { DesignRoomConfig } from "./design-room";

const SHARED_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  concept: { label: "Concept", color: "bg-ash/10 text-ash" },
  designed: { label: "Designed", color: "bg-tentative/10 text-tentative" },
  in_build: { label: "In Progress", color: "bg-brick/10 text-brick" },
  complete: { label: "Complete", color: "bg-confirmed/10 text-confirmed" },
  cut: { label: "Cut", color: "bg-muted/20 text-muted line-through" },
};

export const LIGHTING_CONFIG: DesignRoomConfig = {
  department: "lights",
  departmentLabel: "Lighting Design",
  elementLabel: "Instrument",
  elementLabelPlural: "Instruments",
  elementPlaceholder: "e.g. Front wash, Side light SL, Gobo breakup",
  descriptionPlaceholder: "Type, color, template, channel, purpose...",
  notesPlaceholder: "Hang position, circuit, dimmer, special notes...",
  referenceCategories: [
    { value: "light_plot", label: "Light Plot" },
    { value: "channel_hookup", label: "Channel Hookup" },
    { value: "magic_sheet", label: "Magic Sheet" },
    { value: "reference", label: "Reference" },
    { value: "mood_board", label: "Mood Board" },
    { value: "photo", label: "Photo" },
    { value: "technical", label: "Technical" },
  ],
  statusLabels: SHARED_STATUS_LABELS,
  guidance: {
    title: "Where to start",
    steps: [
      'Start with the <strong class="text-ink">Scene Breakdown</strong> tab. For each scene, describe the quality of light — time of day, mood, temperature, motivation. What is the light <em>doing</em> in this moment?',
      'From those notes, identify the <strong class="text-ink">Instruments</strong> you need — front wash, specials, side light, backlights, gobos. Each one is a tool to shape what the audience sees.',
      'Upload <strong class="text-ink">References</strong> — light plots, magic sheets, inspiration photos, or stills from other productions that capture the quality of light you\'re after.',
      'The <strong class="text-ink">Progress</strong> milestones track you from concept through tech. Check them off as you go.',
    ],
  },
};

export const SOUND_CONFIG: DesignRoomConfig = {
  department: "sound",
  departmentLabel: "Sound Design",
  elementLabel: "Cue",
  elementLabelPlural: "Cues",
  elementPlaceholder: "e.g. Pre-show ambience, Transition music, SFX thunder",
  descriptionPlaceholder: "Source, duration, volume level, playback notes...",
  notesPlaceholder: "Trigger point, fade time, speaker routing...",
  referenceCategories: [
    { value: "sound_plot", label: "Sound Plot" },
    { value: "speaker_plot", label: "Speaker Plot" },
    { value: "reference", label: "Reference" },
    { value: "mood_board", label: "Mood Board" },
    { value: "source_music", label: "Source Music" },
    { value: "technical", label: "Technical" },
  ],
  statusLabels: {
    concept: { label: "Concept", color: "bg-ash/10 text-ash" },
    designed: { label: "Sourced", color: "bg-tentative/10 text-tentative" },
    in_build: { label: "In Edit", color: "bg-brick/10 text-brick" },
    complete: { label: "Complete", color: "bg-confirmed/10 text-confirmed" },
    cut: { label: "Cut", color: "bg-muted/20 text-muted line-through" },
  },
  guidance: {
    title: "Where to start",
    steps: [
      'Start with the <strong class="text-ink">Scene Breakdown</strong> tab. For each scene, describe the sound world — what does this place sound like? What\'s the emotional temperature? Is there silence, and is that silence intentional?',
      'From those notes, identify your <strong class="text-ink">Cues</strong> — pre-show, transitions, underscoring, sound effects, source music. Each cue has a trigger and a purpose.',
      'Upload <strong class="text-ink">References</strong> — sound plots, speaker plots, reference tracks, or anything that communicates the sonic world of the production.',
      'The <strong class="text-ink">Progress</strong> milestones track you from script analysis through tech. The sound world starts in your imagination and ends in the speakers.',
    ],
  },
};
