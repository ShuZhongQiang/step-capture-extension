const ASSET_DB_NAME = 'step_recorder_db';
const ASSET_DB_VERSION = 1;
const ASSET_STORE_NAME = 'assets';

let assetDbPromise = null;

function openAssetDb() {
  if (assetDbPromise) {
    return assetDbPromise;
  }

  assetDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(ASSET_DB_NAME, ASSET_DB_VERSION);

    request.onerror = () => {
      reject(request.error || new Error('indexeddb_open_failed'));
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ASSET_STORE_NAME)) {
        const store = db.createObjectStore(ASSET_STORE_NAME, { keyPath: 'id' });
        store.createIndex('stepId', 'stepId', { unique: false });
        store.createIndex('sessionId', 'sessionId', { unique: false });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        assetDbPromise = null;
      };
      resolve(db);
    };
  });

  return assetDbPromise;
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function blobToDataUrl(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  return `data:${blob.type || 'application/octet-stream'};base64,${arrayBufferToBase64(arrayBuffer)}`;
}

async function getImageDimensions(blob) {
  if (typeof createImageBitmap !== 'function') {
    return { width: null, height: null };
  }

  try {
    const bitmap = await createImageBitmap(blob);
    const dimensions = {
      width: bitmap.width,
      height: bitmap.height
    };

    if (typeof bitmap.close === 'function') {
      bitmap.close();
    }

    return dimensions;
  } catch (error) {
    console.warn('[asset-store] failed to inspect image dimensions:', error);
    return { width: null, height: null };
  }
}

async function putImageAsset(assetInput) {
  const db = await openAssetDb();
  const blob = assetInput.blob || await dataUrlToBlob(assetInput.dataUrl);
  const dimensions = await getImageDimensions(blob);
  const assetRecord = {
    id: assetInput.id,
    sessionId: assetInput.sessionId,
    stepId: assetInput.stepId,
    kind: assetInput.kind || 'primary',
    mimeType: blob.type || assetInput.mimeType || 'image/png',
    blob,
    width: dimensions.width,
    height: dimensions.height,
    createdAt: assetInput.createdAt || new Date().toISOString()
  };

  await new Promise((resolve, reject) => {
    const transaction = db.transaction(ASSET_STORE_NAME, 'readwrite');
    transaction.onerror = () => reject(transaction.error || new Error('asset_put_failed'));
    transaction.oncomplete = () => resolve();
    transaction.objectStore(ASSET_STORE_NAME).put(assetRecord);
  });

  return {
    id: assetRecord.id,
    sessionId: assetRecord.sessionId,
    stepId: assetRecord.stepId,
    kind: assetRecord.kind,
    mimeType: assetRecord.mimeType,
    width: assetRecord.width,
    height: assetRecord.height,
    byteSize: blob.size,
    createdAt: assetRecord.createdAt
  };
}

async function getAssetPreview(assetId) {
  const db = await openAssetDb();
  const assetRecord = await new Promise((resolve, reject) => {
    const transaction = db.transaction(ASSET_STORE_NAME, 'readonly');
    const request = transaction.objectStore(ASSET_STORE_NAME).get(assetId);
    request.onerror = () => reject(request.error || new Error('asset_get_failed'));
    request.onsuccess = () => resolve(request.result || null);
  });

  if (!assetRecord) {
    return null;
  }

  return {
    id: assetRecord.id,
    kind: assetRecord.kind,
    mimeType: assetRecord.mimeType,
    width: assetRecord.width,
    height: assetRecord.height,
    createdAt: assetRecord.createdAt,
    dataUrl: await blobToDataUrl(assetRecord.blob)
  };
}

async function deleteStepAssets(stepId) {
  const db = await openAssetDb();
  const assets = await new Promise((resolve, reject) => {
    const transaction = db.transaction(ASSET_STORE_NAME, 'readonly');
    const index = transaction.objectStore(ASSET_STORE_NAME).index('stepId');
    const request = index.getAll(stepId);
    request.onerror = () => reject(request.error || new Error('asset_query_failed'));
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
  });

  if (assets.length === 0) {
    return [];
  }

  await new Promise((resolve, reject) => {
    const transaction = db.transaction(ASSET_STORE_NAME, 'readwrite');
    transaction.onerror = () => reject(transaction.error || new Error('asset_delete_failed'));
    transaction.oncomplete = () => resolve();
    const store = transaction.objectStore(ASSET_STORE_NAME);
    for (const asset of assets) {
      store.delete(asset.id);
    }
  });

  return assets.map((asset) => asset.id);
}
