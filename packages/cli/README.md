# @roomful/cli

Roomful command-line interface — scaffold, diagnose, and inspect Roomful projects.

## Commands

| Command           | Description                                   |
| ----------------- | --------------------------------------------- |
| `roomful init`    | Scaffold a new Roomful project                |
| `roomful doctor`  | Validate config, relay reachability, and auth |
| `roomful demo`    | Open the Roomful demo app                     |
| `roomful inspect` | Inspect a live Roomful room                   |

## Install

```bash
npm install -g @roomful/cli
```

## Usage

```bash
roomful init my-project
cd my-project
npm install
npm run dev
```

```bash
roomful doctor --relay ws://localhost:8787
```

## Environment

| Variable            | Description       |
| ------------------- | ----------------- |
| `ROOMFUL_RELAY_URL` | Default relay URL |
