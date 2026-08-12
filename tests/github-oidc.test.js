const test = require("node:test");
const assert = require("node:assert/strict");
const { validateClaims } = require("../api/_github-oidc");

const now = 1800000000;
const validClaims = {
  iss: "https://token.actions.githubusercontent.com",
  aud: "cibele-prompt-sync",
  repository: "cigoiania/Cibele",
  ref: "refs/heads/claude/ci_goiania",
  event_name: "push",
  sub: "repo:cigoiania/Cibele:ref:refs/heads/claude/ci_goiania",
  nbf: now - 10,
  exp: now + 300,
};

test("aceita somente a identidade do repositório e branch oficiais", () => {
  assert.equal(validateClaims(validClaims, now), true);
  assert.equal(validateClaims({ ...validClaims, repository: "outro/repo" }, now), false);
  assert.equal(validateClaims({ ...validClaims, ref: "refs/heads/outra" }, now), false);
});

test("recusa audiência, evento ou validade incorretos", () => {
  assert.equal(validateClaims({ ...validClaims, aud: "outro" }, now), false);
  assert.equal(validateClaims({ ...validClaims, event_name: "pull_request" }, now), false);
  assert.equal(validateClaims({ ...validClaims, exp: now - 60 }, now), false);
});
