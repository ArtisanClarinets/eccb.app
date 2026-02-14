/**
 * Permission Constants
 *
 * All permissions follow the pattern: resource.action.scope
 * This file serves as the single source of truth for permission strings.
 *
 * @see PERMISSIONS.md for complete permission matrix and role assignments
 */

// =============================================================================
// MUSIC LIBRARY PERMISSIONS
// =============================================================================

/** View all music in the library */
export const MUSIC_VIEW_ALL = 'music.view.all';

/** View only music assigned to the user */
export const MUSIC_VIEW_ASSIGNED = 'music.view.assigned';

/** Create new music pieces in the library */
export const MUSIC_CREATE = 'music.create';

/** Edit existing music pieces */
export const MUSIC_EDIT = 'music.edit';

/** Delete music pieces from the library */
export const MUSIC_DELETE = 'music.delete';

/** Assign music to members */
export const MUSIC_ASSIGN = 'music.assign';

/** Download all music files */
export const MUSIC_DOWNLOAD_ALL = 'music.download.all';

/** Download only assigned music files */
export const MUSIC_DOWNLOAD_ASSIGNED = 'music.download.assigned';

/** Upload music files to the library */
export const MUSIC_UPLOAD = 'music.upload';

// =============================================================================
// MEMBER MANAGEMENT PERMISSIONS
// =============================================================================

/** View all member profiles */
export const MEMBER_VIEW_ALL = 'member.view.all';

/** View members in user's section only */
export const MEMBER_VIEW_SECTION = 'member.view.section';

/** View own member profile only */
export const MEMBER_VIEW_OWN = 'member.view.own';

/** Create new member profiles */
export const MEMBER_CREATE = 'member.create';

/** Edit all member profiles */
export const MEMBER_EDIT_ALL = 'member.edit.all';

/** Edit own member profile only */
export const MEMBER_EDIT_OWN = 'member.edit.own';

/** Delete member profiles */
export const MEMBER_DELETE = 'member.delete';

// =============================================================================
// EVENT MANAGEMENT PERMISSIONS
// =============================================================================

/** View all events (including private ones) */
export const EVENT_VIEW_ALL = 'event.view.all';

/** View public events only */
export const EVENT_VIEW_PUBLIC = 'event.view.public';

/** Create new events */
export const EVENT_CREATE = 'event.create';

/** Edit existing events */
export const EVENT_EDIT = 'event.edit';

/** Delete events */
export const EVENT_DELETE = 'event.delete';

/** Publish events to make them public */
export const EVENT_PUBLISH = 'event.publish';

// =============================================================================
// ATTENDANCE PERMISSIONS
// =============================================================================

/** View attendance for all members */
export const ATTENDANCE_VIEW_ALL = 'attendance.view.all';

/** View attendance for user's section only */
export const ATTENDANCE_VIEW_SECTION = 'attendance.view.section';

/** View own attendance only */
export const ATTENDANCE_VIEW_OWN = 'attendance.view.own';

/** Mark attendance for all members */
export const ATTENDANCE_MARK_ALL = 'attendance.mark.all';

/** Mark attendance for user's section only */
export const ATTENDANCE_MARK_SECTION = 'attendance.mark.section';

/** Mark own attendance only */
export const ATTENDANCE_MARK_OWN = 'attendance.mark.own';

// =============================================================================
// CMS (CONTENT MANAGEMENT SYSTEM) PERMISSIONS
// =============================================================================

/** View all CMS content (including drafts) */
export const CMS_VIEW_ALL = 'cms.view.all';

/** View public CMS content only */
export const CMS_VIEW_PUBLIC = 'cms.view.public';

/** Edit CMS content */
export const CMS_EDIT = 'cms.edit';

/** Publish CMS content */
export const CMS_PUBLISH = 'cms.publish';

/** Delete CMS content */
export const CMS_DELETE = 'cms.delete';

// =============================================================================
// COMMUNICATION PERMISSIONS
// =============================================================================

/** View all announcements */
export const ANNOUNCEMENT_VIEW_ALL = 'announcement.view.all';

/** Create announcements */
export const ANNOUNCEMENT_CREATE = 'announcement.create';

/** Send messages to all members */
export const MESSAGE_SEND_ALL = 'message.send.all';

/** Send messages to user's section only */
export const MESSAGE_SEND_SECTION = 'message.send.section';

// =============================================================================
// ADMIN PERMISSIONS
// =============================================================================

/** View reports and analytics */
export const REPORT_VIEW = 'report.view';

/** Export reports and data */
export const REPORT_EXPORT = 'report.export';

/** Configure system settings */
export const SYSTEM_CONFIG = 'system.config';

/** View audit logs */
export const AUDIT_VIEW = 'audit.view';

// =============================================================================
// PERMISSION TYPE
// =============================================================================

/**
 * Union type of all valid permissions
 * Use this for type-safe permission checking
 */
export type Permission =
  | typeof MUSIC_VIEW_ALL
  | typeof MUSIC_VIEW_ASSIGNED
  | typeof MUSIC_CREATE
  | typeof MUSIC_EDIT
  | typeof MUSIC_DELETE
  | typeof MUSIC_ASSIGN
  | typeof MUSIC_DOWNLOAD_ALL
  | typeof MUSIC_DOWNLOAD_ASSIGNED
  | typeof MUSIC_UPLOAD
  | typeof MEMBER_VIEW_ALL
  | typeof MEMBER_VIEW_SECTION
  | typeof MEMBER_VIEW_OWN
  | typeof MEMBER_CREATE
  | typeof MEMBER_EDIT_ALL
  | typeof MEMBER_EDIT_OWN
  | typeof MEMBER_DELETE
  | typeof EVENT_VIEW_ALL
  | typeof EVENT_VIEW_PUBLIC
  | typeof EVENT_CREATE
  | typeof EVENT_EDIT
  | typeof EVENT_DELETE
  | typeof EVENT_PUBLISH
  | typeof ATTENDANCE_VIEW_ALL
  | typeof ATTENDANCE_VIEW_SECTION
  | typeof ATTENDANCE_VIEW_OWN
  | typeof ATTENDANCE_MARK_ALL
  | typeof ATTENDANCE_MARK_SECTION
  | typeof ATTENDANCE_MARK_OWN
  | typeof CMS_VIEW_ALL
  | typeof CMS_VIEW_PUBLIC
  | typeof CMS_EDIT
  | typeof CMS_PUBLISH
  | typeof CMS_DELETE
  | typeof ANNOUNCEMENT_VIEW_ALL
  | typeof ANNOUNCEMENT_CREATE
  | typeof MESSAGE_SEND_ALL
  | typeof MESSAGE_SEND_SECTION
  | typeof REPORT_VIEW
  | typeof REPORT_EXPORT
  | typeof SYSTEM_CONFIG
  | typeof AUDIT_VIEW;

// =============================================================================
// PERMISSION GROUPS
// =============================================================================

/** All music-related permissions */
export const MUSIC_PERMISSIONS = [
  MUSIC_VIEW_ALL,
  MUSIC_VIEW_ASSIGNED,
  MUSIC_CREATE,
  MUSIC_EDIT,
  MUSIC_DELETE,
  MUSIC_ASSIGN,
  MUSIC_DOWNLOAD_ALL,
  MUSIC_DOWNLOAD_ASSIGNED,
  MUSIC_UPLOAD,
] as const;

/** All member-related permissions */
export const MEMBER_PERMISSIONS = [
  MEMBER_VIEW_ALL,
  MEMBER_VIEW_SECTION,
  MEMBER_VIEW_OWN,
  MEMBER_CREATE,
  MEMBER_EDIT_ALL,
  MEMBER_EDIT_OWN,
  MEMBER_DELETE,
] as const;

/** All event-related permissions */
export const EVENT_PERMISSIONS = [
  EVENT_VIEW_ALL,
  EVENT_VIEW_PUBLIC,
  EVENT_CREATE,
  EVENT_EDIT,
  EVENT_DELETE,
  EVENT_PUBLISH,
] as const;

/** All attendance-related permissions */
export const ATTENDANCE_PERMISSIONS = [
  ATTENDANCE_VIEW_ALL,
  ATTENDANCE_VIEW_SECTION,
  ATTENDANCE_VIEW_OWN,
  ATTENDANCE_MARK_ALL,
  ATTENDANCE_MARK_SECTION,
  ATTENDANCE_MARK_OWN,
] as const;

/** All CMS-related permissions */
export const CMS_PERMISSIONS = [
  CMS_VIEW_ALL,
  CMS_VIEW_PUBLIC,
  CMS_EDIT,
  CMS_PUBLISH,
  CMS_DELETE,
] as const;

/** All communication-related permissions */
export const COMMUNICATION_PERMISSIONS = [
  ANNOUNCEMENT_VIEW_ALL,
  ANNOUNCEMENT_CREATE,
  MESSAGE_SEND_ALL,
  MESSAGE_SEND_SECTION,
] as const;

/** All admin/system permissions */
export const ADMIN_PERMISSIONS = [
  REPORT_VIEW,
  REPORT_EXPORT,
  SYSTEM_CONFIG,
  AUDIT_VIEW,
] as const;

/** All permissions array for seeding and validation */
export const ALL_PERMISSIONS: readonly Permission[] = [
  ...MUSIC_PERMISSIONS,
  ...MEMBER_PERMISSIONS,
  ...EVENT_PERMISSIONS,
  ...ATTENDANCE_PERMISSIONS,
  ...CMS_PERMISSIONS,
  ...COMMUNICATION_PERMISSIONS,
  ...ADMIN_PERMISSIONS,
] as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a string is a valid permission
 */
export function isValidPermission(value: string): value is Permission {
  return ALL_PERMISSIONS.includes(value as Permission);
}

/**
 * Get all permissions for a specific resource
 */
export function getPermissionsByResource(resource: string): Permission[] {
  return ALL_PERMISSIONS.filter((p) => p.startsWith(`${resource}.`));
}
