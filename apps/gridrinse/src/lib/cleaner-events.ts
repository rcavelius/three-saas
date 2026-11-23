/** Window events between the page and the Cleaner (a separate client component further down the page). */
export const CLEANER_EVENTS = {
  sample: "gridrinse:load-sample",
  choose: "gridrinse:choose-file",
  /** CustomEvent<File[]>: files dropped on or chosen in the homepage hero. */
  files: "gridrinse:add-files",
  stage: "gridrinse:stage",
} as const;

/** 1 = no file yet, 2 = reviewing changes, 3 = downloaded. Sent by the Cleaner as `detail` of CLEANER_EVENTS.stage. */
export type CleanerStage = 1 | 2 | 3;
