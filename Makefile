.PHONY: dev build docker-build kind-load deploy copy-dist clean \
       visual-regenerate visual-push visual-update

CONSOLE_IMAGE ?= kubernaut-demo-console:latest
KIND_CLUSTER ?= kubernaut-demo
NAMESPACE ?= kubernaut-system
BASELINES_REGISTRY ?= quay.io/kubernaut-cicd/visual-baselines
PLAYWRIGHT_IMAGE ?= mcr.microsoft.com/playwright:v1.61.0-noble
SNAPSHOT_DIR ?= e2e/visual.spec.ts-snapshots

dev:
	npm run dev

build:
	npm run build

docker-build:
	docker build -t $(CONSOLE_IMAGE) .

kind-load: docker-build
	kind load docker-image $(CONSOLE_IMAGE) --name $(KIND_CLUSTER)

deploy:
	kubectl apply -f deploy/kind/oauth2-proxy.yaml
	kubectl rollout status deployment/kubernaut-console -n $(NAMESPACE) --timeout=120s
	@echo ""
	@echo "Console deployed. Access via: http://localhost:4180"
	@echo "NOTE: Add http://localhost:4180/oauth2/callback to Dex redirectURIs"

copy-dist: build
	$(eval POD := $(shell kubectl get pods -n $(NAMESPACE) -l app.kubernetes.io/name=kubernaut-console -o jsonpath='{.items[0].metadata.name}'))
	kubectl cp dist/ $(NAMESPACE)/$(POD):/usr/share/nginx/html/ -c nginx
	@echo "Static files copied to nginx sidecar."

clean:
	rm -rf dist node_modules

## ─── Visual Regression Baselines ─────────────────────────────────────────────

visual-regenerate: ## Regenerate baselines in the same Linux container as CI
	docker run --rm -v $(PWD):/work -w /work $(PLAYWRIGHT_IMAGE) \
	  bash -c '\
	    corepack enable && corepack prepare pnpm@latest --activate && \
	    pnpm install --frozen-lockfile && \
	    pnpm build && \
	    pnpm run build-storybook && \
	    npx http-server storybook-static -p 6006 -s & \
	    npx wait-on http://localhost:6006/iframe.html --timeout 30000 && \
	    npx playwright test e2e/visual.spec.ts --update-snapshots'
	@echo ""
	@echo "Baselines generated in $(SNAPSHOT_DIR)/"

visual-push: ## Push local baselines to the OCI registry (requires oras + quay login)
	@BRANCH=$$(git branch --show-current); \
	TAG="branch-$$(echo $$BRANCH | sed 's/[^a-zA-Z0-9._-]/-/g')"; \
	echo "Pushing baselines as $(BASELINES_REGISTRY):$$TAG"; \
	cd $(SNAPSHOT_DIR) && \
	oras push "$(BASELINES_REGISTRY):$$TAG" \
	  --artifact-type application/vnd.kubernaut.visual-baselines.v1 \
	  ./:application/vnd.kubernaut.visual-baselines.layer.v1.tar
	@echo "Done."

visual-update: ## Trigger CI-based baseline regeneration (preferred)
	@BRANCH=$$(git branch --show-current); \
	echo "Triggering visual-update workflow on branch: $$BRANCH"; \
	gh workflow run visual-update.yml --ref "$$BRANCH"
	@echo "Monitor progress: gh run list --workflow=visual-update.yml"
