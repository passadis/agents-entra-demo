<!-- azure-cor-disclaimer -->
> **Important:** This skill provides guidance and recommended instructions to assist the AI system. Outputs are not guaranteed to be complete, correct, secure, or applicable to every scenario. Results should be reviewed and validated by a human before being applied. The AI model may choose not to follow all instructions exactly, and additional verification may be required.

# Blazor WASM — Browser Debug Adapter

> 🔲 **Planned** — This adapter is not yet implemented. Emit a `⚠️ LIMITED SUPPORT:` warning per [limited-support.md](../../../limited-support.md).

## VS Code Debugger Type

| Browser / Runtime | VS Code Debugger Type | Required Extension |
|-------------------|----------------------|-------------------|
| Blazor WASM (.NET) | `blazorwasm` | `ms-dotnettools.csharp` |

---

## Launch Configuration

```json
{
  "name": "{id} (debug)",
  "type": "blazorwasm",
  "request": "launch",
  "url": "http://localhost:{port from Framework Lookup Table}",
  "browser": "chrome",
  "cwd": "${workspaceFolder}/{service-root}",
  "preLaunchTask": "{id} dev"
}
```

| Field | Source |
|-------|--------|
| `type` | Always `blazorwasm` |
| `url` | Default Port from [frontend-spa.md § Framework Lookup Table](../frontend-spa.md) |
| `browser` | Which browser to launch — defaults to `chrome` |
| `cwd` | .NET project root |
| `preLaunchTask` | `{id} dev` — the dev server task from [frontend-spa.md § VS Code Task Configuration](../frontend-spa.md) |

---

## Notes

- The `blazorwasm` adapter is provided by the C# extension, not built into VS Code.
- The launch config shape differs from the CDP-based `chrome`/`msedge` adapter — it requires `browser` and `cwd` fields, and does not use `webRoot`.
