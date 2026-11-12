# Starting the update runs

[cron-job.org](https://cron-job.org) starts the Deploy workflow at each slot through the API (`workflow_dispatch`). `deploy.yml` has no `schedule`, because GitHub's is unreliable. From 9 to 13 November 2026 it started 8 of 33 slots. Six were 5–51 minutes late, two came hours after the 10:30pm slot, and the missing runs were never created at all. Others have reported the same in GitHub's community forum since August 2026. Starting a run through the API has always worked.

## Setting it up

### 1. A token that can start the workflow

Signed in to GitHub as `chris14b`, go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**:

- **Token name:** `cron-job.org weather-records`
- **Resource owner:** `chris14b`
- **Expiration:** the longest offered. Record the date under [Token](#token) below.
- **Repository access:** Only select repositories → `chris14b/weather-records`
- **Permissions:** Repository permissions → **Actions: Read and write**. Leave everything else as it is. Metadata is added as read-only on its own.

Copy the token. It goes only into cron-job.org, never into this repository.

### 2. The cron-job.org job

Create a free account at cron-job.org, then **Create cronjob**:

- **Title:** `weather-records deploy`
- **URL:** `https://api.github.com/repos/chris14b/weather-records/actions/workflows/deploy.yml/dispatches`
- **Execution schedule:** custom, every day of every month, every weekday, hours `6, 8, 10, 12, 14, 16, 18, 20, 22`, minute `30`
- **Time zone:** `Australia/Sydney`, so the runs keep to Sydney's clock through daylight saving

On the **Advanced** tab:

- **Request method:** `POST`
- **Headers:**
  - `Authorization`: `Bearer <the token>`
  - `Accept`: `application/vnd.github+json`
  - `X-GitHub-Api-Version`: `2022-11-28`
  - `Content-Type`: `application/json`
- **Request body:** `{"ref":"main"}`

On the **Notifications** tab, turn on the email for a failed run and for the job being disabled after too many failures.

Save, then use **Test run**. GitHub answers `204 No Content`, and a new `workflow_dispatch` run of Deploy appears under Actions within a few seconds. A `401` means the token is wrong or has expired, and a `403` or `404` that it lacks Actions write access to this repository.

## Changing the run times

Change the job's hours in cron-job.org and `updateRunsSydney` in `src/shared/schedule.ts` together. No test can see cron-job.org, so nothing catches them drifting apart.

## Token

- Expires: never

If it is ever revoked or replaced, generate a new one the same way and put it in the job's `Authorization` header. A bad token shows as `401` failures in cron-job.org's history and its emails, and no runs start until it is replaced.
