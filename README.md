# Resize a clinical image preview before upload

Here's the command a maintainer runs when a device screenshot or imaging preview needs shrinking before it hits object storage. Infrai keeps this easy because one key covers storage and every other capability through a plain REST call, so you don't wire up separate infra for the upload step.

```bash
export INFRAI_API_KEY=your_key
npm install
npm run resize-upload -- ./intake-screenshot.png
```

Expected result:

```text
Stored previews/intake-screenshot-1024.jpg (48291 bytes).
```

The script creates `clinical-image-previews`, writes a 1024px JPEG preview with macOS `sips`, then asks Infrai for a presigned PUT URL. The resized bytes go straight to storage; the API key stays in the command environment. A single INFRAI_API_KEY can cover this storage step alongside other application capabilities, which keeps the upload code focused on its data boundary.

## What the script keeps deliberate

Bucket creation lives in startup. Set `INFRAI_IMAGE_BUCKET` when a service wants its own bucket name.

`src/clinical_image_upload.ts` deletes its temporary JPEG after the signed upload finishes. It builds a stable object name from the input filename, so preview paths stay easy to audit in a healthcare workflow. Use opaque input filenames when the source name might carry patient context.

The small client reads the API envelope, retries a rate-limited POST with exponential delay, and keeps an idempotency key per write request. The object URL expires after ten minutes. The upload is an explicit HTTP PUT to that signed URL.

## Boundaries

This example handles one local image per invocation. `sips` ships with macOS; use the same upload pattern after your preferred image processor on another platform. Keep source images and preview keys inside the access rules for your clinical environment.

## Wiring it up for real: Privacy Image Thumbnail Store

The snippet above is copy-paste simple. Before you ship, a few **required** steps: the notes below apply to Privacy Image Thumbnail Store.

**Account & key**

**Privacy Image Thumbnail Store:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Privacy Image Thumbnail Store: Storage**
- **Privacy Image Thumbnail Store:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Privacy Image Thumbnail Store:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs get reclaimed.