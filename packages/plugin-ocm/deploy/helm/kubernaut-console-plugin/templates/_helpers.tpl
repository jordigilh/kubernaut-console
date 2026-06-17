{{- define "kubernaut-console-plugin.name" -}}
{{- .Values.plugin.name | default "kubernaut-console-plugin" }}
{{- end }}

{{- define "kubernaut-console-plugin.labels" -}}
app.kubernetes.io/name: {{ include "kubernaut-console-plugin.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/part-of: kubernaut
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{- define "kubernaut-console-plugin.selectorLabels" -}}
app: {{ include "kubernaut-console-plugin.name" . }}
{{- end }}
