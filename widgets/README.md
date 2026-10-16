# Widgets

Widgets are independently packaged and deployed to their respective host products. They are not part of the Catalyst portal deployment.

- `crm/<widget-name>/`: Zoho CRM widgets
- `creator/<widget-name>/`: Zoho Creator widgets

Every widget needs its own README recording placement, target module/page, SDK assumptions, permissions, build and package process, release method and API contracts. Share code only when reusable without crossing authentication contexts. Do not automatically copy V1 files into this directory.
