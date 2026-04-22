(function initStepRecorderMessages(global) {
  const COMMAND = Object.freeze({
    SESSION_START: 'recorder/session/start',
    SESSION_STOP: 'recorder/session/stop',
    SESSION_GET_SNAPSHOT: 'recorder/session/getSnapshot',
    SETTINGS_UPDATE: 'recorder/settings/update',
    STEP_DELETE: 'recorder/step/delete',
    ASSET_GET_PREVIEW: 'recorder/asset/getPreview',
    DOCUMENT_BUILD: 'recorder/document/build'
  });

  const CONTENT_TO_BACKGROUND = Object.freeze({
    CAPTURE_VISIBLE_TAB: 'recorder/capture/visibleTab',
    ACTION_COMMIT: 'recorder/action/commit',
    RUNTIME_ERROR: 'recorder/runtime/error'
  });

  const BACKGROUND_TO_CONTENT = Object.freeze({
    RUNTIME_START: 'recorder/runtime/start',
    RUNTIME_STOP: 'recorder/runtime/stop',
    RUNTIME_CONFIGURE: 'recorder/runtime/configure'
  });

  const PANEL_TO_CONTENT = Object.freeze({
    IMAGE_PREVIEW_SHOW: 'recorder/panel/preview/show',
    IMAGE_PREVIEW_HIDE: 'recorder/panel/preview/hide'
  });

  const EVENT = Object.freeze({
    SNAPSHOT: 'recorder/event/snapshot',
    SESSION_UPDATED: 'recorder/event/sessionUpdated',
    STEP_UPSERTED: 'recorder/event/stepUpserted',
    STEP_DELETED: 'recorder/event/stepDeleted',
    ASSET_READY: 'recorder/event/assetReady'
  });

  global.StepRecorderMessages = Object.freeze({
    PANEL_PORT_NAME: 'recorder-panel',
    COMMAND: COMMAND,
    CONTENT_TO_BACKGROUND: CONTENT_TO_BACKGROUND,
    BACKGROUND_TO_CONTENT: BACKGROUND_TO_CONTENT,
    PANEL_TO_CONTENT: PANEL_TO_CONTENT,
    EVENT: EVENT
  });
})(typeof self !== 'undefined' ? self : window);
