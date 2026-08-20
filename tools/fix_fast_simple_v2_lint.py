from pathlib import Path

path = Path("app/job-radar.tsx")
text = path.read_text(encoding="utf-8")
old = '''  const [jobSort, setJobSort] = useState<(typeof sortOptions)[number]["value"]>("score");
  const [jobQuery, setJobQuery] = useState("");
  const deferredJobQuery = useDeferredValue(jobQuery);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scanPanelOpen, setScanPanelOpen] = useState(false);
  const [applicationInsightsOpen, setApplicationInsightsOpen] = useState(false);
  const [saved, setSaved] = useState<number[]>([]);
  const [applicationBucket, setApplicationBucket] = useState<ApplicationBucket>("submitted");
  const [dailyJobs, setDailyJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);'''
new = '''  const [jobSort, setJobSort] = useState<(typeof sortOptions)[number]["value"]>("score");
  const [jobQuery, setJobQuery] = useState("");
  const deferredJobQuery = useDeferredValue(jobQuery);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scanPanelOpen, setScanPanelOpen] = useState(false);
  const [applicationInsightsOpen, setApplicationInsightsOpen] = useState(false);
  const [initialJobCache] = useState<Job[]>(() => readJobSessionCache());
  const [saved, setSaved] = useState<number[]>(() => initialJobCache.filter((job) => job.saved).map((job) => job.id));
  const [applicationBucket, setApplicationBucket] = useState<ApplicationBucket>("submitted");
  const [dailyJobs, setDailyJobs] = useState<Job[]>(() => initialJobCache);
  const [jobsLoading, setJobsLoading] = useState(() => initialJobCache.length === 0);'''
if old not in text:
    raise SystemExit("state initialization anchor not found")
text = text.replace(old, new, 1)
old_effect = '''  useEffect(() => {
    let active = true;
    const cachedRows = readJobSessionCache();
    if (cachedRows.length) {
      setDailyJobs(cachedRows);
      setSaved(cachedRows.filter((job) => job.saved).map((job) => job.id));
      setJobsLoading(false);
    }
    fetch("/api/jobs", { cache: "no-store" })'''
new_effect = '''  useEffect(() => {
    let active = true;
    fetch("/api/jobs", { cache: "no-store" })'''
if old_effect not in text:
    raise SystemExit("initial jobs effect anchor not found")
text = text.replace(old_effect, new_effect, 1)
path.write_text(text, encoding="utf-8")
print("lazy cache initialization applied")
