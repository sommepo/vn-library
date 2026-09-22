import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('usage',Path(__file__).resolve().parents[1]/'scripts/record-task-usage.py')
usage=importlib.util.module_from_spec(spec);spec.loader.exec_module(usage)


class TaskUsage(unittest.TestCase):
    def rows(self):
        return [
            {'timestamp':'01','type':'turn_context','payload':{'model':'test-model','effort':'high'}},
            {'timestamp':'02','type':'event_msg','payload':{'type':'token_count','info':{'total_token_usage':{'input_tokens':100,'cached_input_tokens':80,'output_tokens':10,'reasoning_output_tokens':3,'total_tokens':110}}}},
            {'timestamp':'03','type':'response_item','payload':{'type':'message','role':'user','content':[{'text':'begin test task'}]}},
            {'timestamp':'04','type':'event_msg','payload':{'type':'token_count','info':{'total_token_usage':{'input_tokens':300,'cached_input_tokens':200,'output_tokens':40,'reasoning_output_tokens':8,'total_tokens':340}}}},
        ]

    def measure(self,rows):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'log.jsonl';p.write_text('\n'.join(map(json.dumps,rows)))
            return usage.measure(p,'begin test task')

    def test_deltas_and_subsets(self):
        r=self.measure(self.rows())
        self.assertEqual((r['input_tokens'],r['cached_input_tokens'],r['uncached_input_tokens'],r['output_tokens'],r['total_tokens']),(200,120,80,30,230))
        self.assertEqual(r['model'],'test-model');self.assertEqual(r['reasoning_output_tokens'],5)

    def test_missing_baseline_or_reset_is_not_zero(self):
        self.assertEqual(self.measure(self.rows()[2:])['total_tokens'],'')
        rows=self.rows();rows.append(rows[1]|{'timestamp':'05'})
        self.assertEqual(self.measure(rows)['total_tokens'],'')

    def test_row_update_keeps_other_tasks(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'usage.csv';first={'task_id':'one','task':'first'}
            usage.save_row(p,first);usage.save_row(p,{'task_id':'two','task':'second'})
            usage.save_row(p,first|{'total_tokens':123})
            with p.open() as f: rows=list(usage.csv.DictReader(f))
            self.assertEqual(len(rows),2);self.assertEqual(rows[0]['total_tokens'],'123')

    def test_finalise_before_next_task(self):
        rows=self.rows()
        rows.append({'timestamp':'05','type':'response_item','payload':{'type':'message','role':'user','content':[{'text':'new unrelated task'}]}})
        rows.append(rows[1]|{'timestamp':'06'})
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'log';p.write_text('\n'.join(map(json.dumps,rows)))
            self.assertEqual(usage.measure(p,'begin test task','new unrelated task')['total_tokens'],230)

    def test_latest_exact_request_has_its_own_baseline(self):
        rows=self.rows()
        rows += [rows[2]|{'timestamp':'05'}, rows[0]|{'timestamp':'06','payload':{'model':'second-model','effort':'medium'}}]
        rows.append({'timestamp':'07','type':'event_msg','payload':{'type':'token_count','info':{'total_token_usage':{'input_tokens':350,'cached_input_tokens':210,'output_tokens':45,'reasoning_output_tokens':9,'total_tokens':395}}}})
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'log';p.write_text('\n'.join(map(json.dumps,rows)))
            result=usage.measure(p,'begin test task',exact=True,last=True)
            self.assertEqual(result['started_at'],'05');self.assertEqual(result['total_tokens'],55)
            self.assertEqual(result['model'],'second-model')
            with self.assertRaises(ValueError):usage.measure(p,'begin test',exact=True,last=True)
            with self.assertRaises(ValueError):usage.measure(p,'begin test task','new task',last=True)


if __name__=='__main__':unittest.main()
