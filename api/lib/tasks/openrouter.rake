# Guards the configured AI model list against config rot.
#
# Two distinct failures this catches, both seen for real on 2026-07-29:
#
#   1. RETIRED SLUGS. Two of the three configured fallback models had been removed
#      upstream (404 "No endpoints found"), silently reducing the fallback chain to
#      a single working model — invisible until the lead model also failed.
#   2. BACKEND/SLUG MISMATCH. Model naming is backend-specific: OpenRouter wants
#      "google/gemini-2.5-flash", Google's OpenAI-compatible endpoint wants the bare
#      "gemini-2.5-flash". Point OPENROUTER_BASE_URL at one and leave the slugs for
#      the other, and every candidate fails for a reason absent from the request.
#
# Works against either backend — it reads OPENROUTER_BASE_URL, so it validates
# whatever is actually configured rather than assuming OpenRouter.
namespace :openrouter do
  desc "Check the configured AI models against the live catalog of the configured backend"
  task verify_models: :environment do
    require "faraday"

    api_key = Rails.application.credentials.dig(:open_router, :api_key) || ENV["OPENROUTER_API_KEY"]
    base    = (ENV["OPENROUTER_BASE_URL"].presence || OpenRouterService::DEFAULT_BASE_URL).chomp("/")
    models  = OpenRouterService.models

    abort "OPENROUTER_API_KEY is not set." if api_key.blank?

    # Which backend are we actually talking to? Determines expected slug style.
    openrouter_backend = base.include?("openrouter.ai") || base.end_with?("/api/v1")
    backend_label = openrouter_backend ? "OpenRouter" : "OpenAI-compatible (non-OpenRouter)"

    puts "Backend:  #{backend_label}"
    puts "Base URL: #{base}"
    puts "Models:   #{models.join(', ')}"
    puts "Source:   #{ENV['OPENROUTER_MODELS'].present? ? 'OPENROUTER_MODELS env override' : 'compiled-in DEFAULT_MODELS'}"
    puts

    conn = Faraday.new(url: "#{base}/") do |f|
      f.response :json, content_type: /\bjson/
      f.options.open_timeout = 10
      f.options.timeout = 40
    end

    response =
      begin
        conn.get("models") { |req| req.headers["Authorization"] = "Bearer #{api_key}" }
      rescue Faraday::Error => e
        abort "Could not reach the catalog (#{e.class}: #{e.message}).\n" \
              "If you are in a blocked region, point OPENROUTER_BASE_URL at a reachable proxy."
      end

    unless response.success?
      body = response.body.is_a?(String) ? response.body : response.body.inspect
      abort "Catalog request failed: HTTP #{response.status}\n#{body}\n\n" \
            "A 403 with \"Access denied by security policy\" means an intermediary blocked the\n" \
            "request before it reached the backend — point OPENROUTER_BASE_URL at a proxy."
    end

    # Both backends return { "data" => [ { "id" => ... }, ... ] }.
    catalog = Array(response.body.is_a?(Hash) ? response.body["data"] : nil)
    abort "Catalog came back empty or in an unexpected shape." if catalog.empty?

    # Google's compat catalog reports ids as "models/gemini-2.5-flash" while
    # chat/completions accepts the bare "gemini-2.5-flash". Index both forms so a
    # correctly-configured bare slug is not reported as missing.
    ids = catalog.filter_map { |m| m["id"] }
    lookup = {}
    ids.each do |id|
      lookup[id] = id
      lookup[id.sub(%r{\Amodels/}, "")] ||= id
    end

    puts "#{catalog.size} models in catalog.\n\n"

    problems = []
    models.each_with_index do |slug, i|
      catalog_id = lookup[slug]

      unless catalog_id
        puts "#{i + 1}. #{slug}\n   ✗ NOT IN CATALOG (retired, misspelled, or wrong slug style for this backend)"

        # A namespaced slug against a non-OpenRouter backend (or the reverse) is the
        # single most likely cause, so name it explicitly rather than making the
        # operator infer it from a list of near-misses.
        if slug.include?("/") && !openrouter_backend
          bare = slug.split("/").last
          hint = lookup[bare] ? " — and \"#{bare}\" IS in this catalog" : ""
          puts "   → this backend expects BARE slugs, not \"provider/model\"#{hint}"
        elsif !slug.include?("/") && openrouter_backend
          puts "   → OpenRouter expects namespaced slugs, e.g. \"google/#{slug}\""
        end

        suggestions = lookup.keys.reject { |k| k.start_with?("models/") }
                            .select { |k| k.include?(slug.split(%r{[/-]}).first.to_s) }
                            .sort.first(6)
        puts "   similar available: #{suggestions.join(', ')}" if suggestions.any?
        problems << "#{slug} — not in catalog"
        next
      end

      puts "#{i + 1}. #{slug}\n   ✓ live (catalog id: #{catalog_id})"

      # Modality metadata is OpenRouter-specific. Where it exists, enforce the hard
      # requirement that this chain analyzes images; where it doesn't, say so rather
      # than reporting a false problem.
      entry = catalog.find { |m| m["id"] == catalog_id } || {}
      modalities = Array(entry.dig("architecture", "input_modalities"))
      if modalities.any?
        puts "   input modalities: #{modalities.join(', ')}"
        unless modalities.include?("image")
          puts "   ✗ REJECTS IMAGE INPUT — cannot analyze documents"
          problems << "#{slug} — no image input"
        end
      else
        puts "   input modalities: not reported by this backend (not verifiable here)"
      end
    end

    puts "\n#{'-' * 64}"
    if problems.empty?
      puts "OK — all #{models.size} configured models are present in the live catalog."
      puts "Note: at least 2 candidates configured, so the lead model has a fallback." if models.size >= 2
      puts "WARNING: only 1 model configured — no fallback if it fails." if models.size < 2
    else
      puts "#{problems.size} problem(s):"
      problems.each { |p| puts "  - #{p}" }
      puts "\nFix by editing OPENROUTER_MODELS in api/.env, or"
      puts "OpenRouterService::DEFAULT_MODELS in app/services/open_router_service.rb."
      exit 1
    end
  end

  desc "End-to-end smoke test: analyze a generated lab-report image through the configured backend"
  task :smoke, [ :locale ] => :environment do |_t, args|
    locale = args[:locale].presence || "fa"

    path = Rails.root.join("tmp", "openrouter_smoke.png")
    unless path.exist?
      abort "Missing fixture #{path}. Generate one, or pass any image at that path."
    end

    file = File.open(path)
    file.define_singleton_method(:content_type) { "image/png" }

    puts "Analyzing #{path} (locale: #{locale}) ..."
    started = Time.zone.now
    result = OpenRouterService.new.analyze_document(file, locale: locale)
    puts "Completed in #{(Time.zone.now - started).round(2)}s\n\n"

    puts "summary       : #{result['summary']}"
    puts "questions     : #{result['questions'].size}"
    result["questions"].each_with_index { |q, i| puts "   #{i + 1}. #{q}" }
    puts "vital_badges  : #{result['vital_badges'].size}"
    result["vital_badges"].each { |b| puts "   #{b['icon']} #{b['label']}: #{b['value']} [#{b['status']}]" }
    puts "medical_terms : #{result['medical_terms'].size}"
    result["medical_terms"].each { |t| puts "   #{t['term']} — #{t['definition']}" }

    missing = []
    missing << "summary" if result["summary"].blank?
    missing << "questions" if result["questions"].empty?
    missing << "vital_badges" if result["vital_badges"].empty?
    if missing.any?
      puts "\nFAIL — empty: #{missing.join(', ')}"
      exit 1
    end
    puts "\nOK — all sections populated."
  end
end
