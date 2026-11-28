// Old link (Post > Review jobs): jobs are reviewed in Admin > Jobs now.
import { Redirect } from 'expo-router';

export default function ReviewJobs() {
  return <Redirect href="/admin/jobs" />;
}
