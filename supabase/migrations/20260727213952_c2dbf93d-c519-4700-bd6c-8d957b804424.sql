CREATE TABLE public.ats_config (
  id text PRIMARY KEY,
  config jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ats_config TO anon;
GRANT SELECT ON public.ats_config TO authenticated;
GRANT ALL ON public.ats_config TO service_role;

ALTER TABLE public.ats_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ats_config public read"
  ON public.ats_config
  FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO public.ats_config (id, config, version) VALUES (
  'registry',
  '{
    "adapters": {
      "greenhouse": {
        "hostRe": "(?:^|\\\\.)greenhouse\\\\.io$|boards\\\\.greenhouse\\\\.io$|job-boards\\\\.greenhouse\\\\.io$",
        "detectSelectors": ["form[id=\"application_form\"]", "[id^=\"job_application_\"]"],
        "idPrefix": "job_application_",
        "idPrefixStripRe": "^job_application_(answers_attributes_\\\\d+_)?",
        "wrapperSelectors": [".field", ".application-question", "li"],
        "groupingSelectors": [".application-question", ".field"],
        "requiredSelectors": [".required", ".asterisk"]
      },
      "lever": {
        "hostRe": "(?:^|\\\\.)lever\\\\.co$|jobs\\\\.lever\\\\.co$",
        "detectSelectors": [".application-question", ".lever-apply"],
        "wrapperSelectors": [".application-question", ".application-field"],
        "labelSelectors": [".application-label", ".question-label", "label"],
        "groupingSelectors": [".application-question", ".application-field"],
        "requiredSelectors": [".required"]
      },
      "workday": {
        "hostRe": "myworkday(?:jobs|site)?\\\\.com$|\\\\.wd\\\\d+\\\\.myworkday(?:jobs)?\\\\.com$",
        "detectSelectors": ["[data-automation-id]"],
        "automationAttr": "data-automation-id",
        "promptAttr": "data-automation-id-prompt",
        "requiredAttr": "data-required",
        "rowSelectors": ["[data-automation-id*=\"row\" i]", "[data-automation-id*=\"Row\"]"],
        "humanizeStripPrefix": "formField-"
      },
      "icims": {
        "hostRe": "icims\\\\.com$|jobs\\\\.icims\\\\.com$",
        "detectSelectors": ["[class^=\"iCIMS_\"]", "[id^=\"iCIMS_\"]"],
        "wrapperSelectors": [".iCIMS_TableRow", "[class*=\"iCIMS_InfoField\"]"],
        "labelSelectors": [".iCIMS_InfoField_Label", "label", ".iCIMS_Label"],
        "groupingSelectors": [".iCIMS_TableRow", "[class*=\"iCIMS_InfoField\"]"],
        "requiredSelectors": [".iCIMS_Required", "[class*=\"Required\"]"]
      },
      "ashby": {
        "hostRe": "ashbyhq\\\\.com$|jobs\\\\.ashbyhq\\\\.com$",
        "detectSelectors": ["[class*=\"ashby-application\" i]", "[data-testid^=\"ashby\"]"],
        "wrapperSelectors": ["[class*=\"_fieldEntry_\" i]", "[class*=\"fieldEntry\" i]"],
        "labelSelectors": ["[class*=\"_label_\" i]", "label"],
        "groupingSelectors": ["[class*=\"_fieldEntry_\" i]", "[class*=\"fieldEntry\" i]"],
        "choiceButtonSelectors": ["button", "[role=\"button\"]", "[role=\"radio\"]", "[role=\"option\"]"]
      }
    },
    "humanTypingHosts": [
      "myworkdayjobs.com",
      "myworkday.com",
      "myworkdaysite.com",
      "icims.com",
      "taleo.net",
      "brassring.com",
      "successfactors.com",
      "successfactors.eu"
    ]
  }'::jsonb,
  1
);