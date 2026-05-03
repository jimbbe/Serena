# CI Pipeline Specification

## Purpose

Automate code quality checks on every pull request and push to main using GitHub Actions, preventing regressions from merging.

## Requirements

### Requirement: GitHub Actions Workflow

The system MUST have a CI workflow at `.github/workflows/ci.yml` that runs automated checks on code changes.

#### Scenario: Workflow exists at correct path

- GIVEN the repository
- THEN the file `.github/workflows/ci.yml` exists
- AND it is a valid GitHub Actions workflow file

#### Scenario: CI triggers on pull request to main

- GIVEN the CI workflow is configured
- WHEN a pull request targets the `main` branch
- THEN the CI workflow is triggered
- AND all jobs must pass before merge is allowed

#### Scenario: CI triggers on push to main

- GIVEN the CI workflow is configured
- WHEN code is pushed directly to the `main` branch
- THEN the CI workflow is triggered

### Requirement: CI Jobs

The workflow MUST run three jobs in sequence: dependency installation, type/lint checks, and tests.

#### Scenario: npm ci installs dependencies

- GIVEN the CI workflow runs
- THEN `npm ci` executes successfully
- AND it uses the lockfile for deterministic installs

#### Scenario: npm run check passes

- GIVEN dependencies are installed
- THEN `npm run check` executes
- AND it exits with code 0 (no type errors, no lint failures)

#### Scenario: npm test passes

- GIVEN dependencies are installed
- THEN `npm test` executes
- AND all tests pass with exit code 0
