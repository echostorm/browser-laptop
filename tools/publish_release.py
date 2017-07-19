#!/usr/bin/env python
# for more info see https://developer.github.com/v3/repos/releases/

import json
import os
from lib.github import GitHub
import requests

BROWSER_LAPTOP_REPO = 'brave/browser-laptop'
TARGET_ARCH= os.environ['TARGET_ARCH'] if os.environ.has_key('TARGET_ARCH') else 'x64'
RELEASE_NAME = 'Dev Channel Beta'

def main():
  github = GitHub(auth_token())
  releases = github.repos(BROWSER_LAPTOP_REPO).releases.get()
  version = json.load(open('package.json'))['version']
  tag = ('v' + version + release_channel())
  tag_exists = False
  for release in releases:
    if not release['draft'] and release['tag_name'] == tag:
      tag_exists = True
      break
  release = create_or_get_release_draft(github, releases, tag,
                                        tag_exists)
  # match version to GitHub milestone
  commit_tag = None
  parts = version.split('.', 3)
  if (len(parts) == 3):
    parts[2] = 'x'
    commit_tag = '.'.join(parts)

  # Press the publish button.
  if not tag_exists and commit_tag:
    publish_release(github, release['id'], tag, commit_tag)

def create_release_draft(github, tag):
  name = '{0} {1}'.format(RELEASE_NAME, tag)
  # TODO: Parse release notes from CHANGELOG.md
  body = '(placeholder)'
  if body == '':
    sys.stderr.write('Quit due to empty release note.\n')
    sys.exit(1)
  data = dict(tag_name=tag, name=name, body=body, draft=True, prerelease=True)
  r = github.repos(BROWSER_LAPTOP_REPO).releases.post(data=data)
  return r

def create_or_get_release_draft(github, releases, tag, tag_exists):
  # Search for existing draft.
  for release in releases:
    if release['draft']:
      return release

  if tag_exists:
    tag = 'do-not-publish-me'
  return create_release_draft(github, tag)

def auth_token():
  token = os.environ['GITHUB_TOKEN']
  message = ('Error: Please set the $GITHUB_TOKEN '
             'environment variable, which is your personal token')
  assert token, message
  return token

def release_channel():
  channel = os.environ['CHANNEL']
  message = ('Error: Please set the $CHANNEL '
             'environment variable, which is your release channel')
  assert channel, message
  return channel

def publish_release(github, release_id, tag, commit_tag):
  data = dict(draft=False, prerelease=True, tag_name=tag, target_commitish=commit_tag)
  github.repos(BROWSER_LAPTOP_REPO).releases(release_id).patch(data=data)

if __name__ == '__main__':
  import sys
  sys.exit(main())
