{{/*
Expand the name of the chart.
*/}}
{{- define "kubernaut-console.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "kubernaut-console.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "kubernaut-console.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "kubernaut-console.labels" -}}
helm.sh/chart: {{ include "kubernaut-console.chart" . }}
{{ include "kubernaut-console.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: kubernaut
app.kubernetes.io/component: frontend
{{- end }}

{{/*
Selector labels
*/}}
{{- define "kubernaut-console.selectorLabels" -}}
app.kubernetes.io/name: {{ include "kubernaut-console.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Detect OpenShift via Route API availability.
*/}}
{{- define "kubernaut-console.isOpenShift" -}}
{{- if .Capabilities.APIVersions.Has "route.openshift.io/v1" -}}
true
{{- else -}}
false
{{- end -}}
{{- end }}

{{/*
Cookie secure flag — true on OpenShift (TLS-terminated routes), false otherwise.
*/}}
{{- define "kubernaut-console.cookieSecure" -}}
{{- if eq (include "kubernaut-console.isOpenShift" .) "true" -}}
true
{{- else -}}
false
{{- end -}}
{{- end }}

{{/*
OAuth2 redirect URL — explicit value or auto-derived from route/service.
*/}}
{{- define "kubernaut-console.redirectUrl" -}}
{{- if .Values.auth.redirectUrl -}}
{{- .Values.auth.redirectUrl -}}
{{- else if and (eq (include "kubernaut-console.isOpenShift" .) "true") .Values.route.host -}}
{{- printf "https://%s/oauth2/callback" .Values.route.host -}}
{{- else -}}
{{- printf "http://%s.%s.svc:%v/oauth2/callback" (include "kubernaut-console.fullname" .) .Release.Namespace .Values.service.port -}}
{{- end -}}
{{- end }}
