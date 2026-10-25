#!/usr/bin/env python3
import json,os,time
from pathlib import Path
from urllib.parse import urljoin
from html.parser import HTMLParser
import requests
SITE=os.environ.get('SITE_URL','https://www.statenewscentral.com').rstrip('/')
CANONICAL_ORIGIN=os.environ.get('SEO_CANONICAL_ORIGIN',SITE).rstrip('/')
for raw in Path('/home/aaisha/workspaces/statenewscentral/.env').read_text().splitlines():
 s=raw.strip()
 if not s or s.startswith('#') or '=' not in s:continue
 k,v=s.split('=',1);os.environ.setdefault(k.strip(),v.strip().strip('"').strip("'"))
client=os.environ.get('NEXT_PUBLIC_TINA_CLIENT_ID');token=os.environ.get('TINA_TOKEN');branch=os.environ.get('NEXT_PUBLIC_TINA_BRANCH','main')
api=f'https://content.tinajs.io/2.4/content/{client}/github/{branch}'
F='metaTitle metaDescription ogTitle ogDescription ogImage canonicalUrl noindex nofollow'
q=f'''query AllSeoAudit {{
 config(relativePath:"config.json"){{seo{{title description logo favicon footerLogo defaultSocialImage}} footer{{copyrightText}} _sys{{filename}}}}
 pageConnection(first:100){{edges{{node{{title draft permalink seo{{{F}}} _sys{{filename}}}}}}}}
 blogConnection(first:100){{edges{{node{{title description draft permalink pubDate seo{{{F}}} _sys{{filename}}}}}}}}
 categoryConnection(first:100){{edges{{node{{title description seo{{{F}}} _sys{{filename}}}}}}}}
 userConnection(first:100){{edges{{node{{name bio seo{{{F}}} _sys{{filename}}}}}}}}
 navigationConnection(first:100){{edges{{node{{title items{{label href children{{label href}}}} _sys{{filename}}}}}}}}
}}'''
r=requests.post(api,headers={'X-API-KEY':token,'content-type':'application/json','accept-encoding':'identity'},json={'query':q},timeout=60);r.raise_for_status();payload=r.json();
if payload.get('errors'):raise SystemExit(json.dumps(payload['errors']))
d=payload['data'];cfg=d['config'];site_title=(cfg.get('seo')or{}).get('title') or 'State News Central';site_desc=(cfg.get('seo')or{}).get('description') or ''
class P(HTMLParser):
 def __init__(s):super().__init__();s.h=False;s.t=False;s.title='';s.meta=[];s.links=[]
 def handle_starttag(s,t,a):
  x=dict(a)
  if t=='head':s.h=True
  elif s.h and t=='title':s.t=True
  elif s.h and t=='meta':s.meta.append(x)
  elif s.h and t=='link':s.links.append(x)
 def handle_endtag(s,t):
  if t=='title':s.t=False
  elif t=='head':s.h=False
 def handle_data(s,x):
  if s.t:s.title+=x
def one(arr,k,v):return [x.get('content','') for x in arr if x.get(k)==v]
def route(v,filename,prefix=''):
 v=(v or '').strip('/')
 if not v or filename in ('home','index'):return '/'
 return '/'+('/'.join(x for x in [prefix,v or filename] if x)).strip('/')+'/'
def docs(name):return [(e or {}).get('node') for e in ((d.get(name+'Connection')or{}).get('edges')or[]) if (e or {}).get('node')]
checks=[];fails=[]
def audit(kind,node,path,title,desc):
 s=node.get('seo')or{};social_title=s.get('ogTitle')or title;social_desc=s.get('ogDescription')or desc;canon=urljoin(CANONICAL_ORIGIN+'/',s.get('canonicalUrl')or path);robots=('noindex' if s.get('noindex') else 'index')+', '+('nofollow' if s.get('nofollow') else 'follow')
 rr=requests.get(SITE+path,params={'all-seo-audit':time.time_ns()},headers={'cache-control':'no-cache','user-agent':'SNC-ALL-SEO-AUDIT'},timeout=45);p=P();p.feed(rr.text)
 actual={'title':[p.title],'description':one(p.meta,'name','description'),'ogTitle':one(p.meta,'property','og:title'),'ogDescription':one(p.meta,'property','og:description'),'twitterTitle':one(p.meta,'name','twitter:title'),'twitterDescription':one(p.meta,'name','twitter:description'),'canonical':[x.get('href','') for x in p.links if 'canonical' in str(x.get('rel','')).split()],'robots':one(p.meta,'name','robots')};expected={'title':[title],'description':[desc],'ogTitle':[social_title],'ogDescription':[social_desc],'twitterTitle':[social_title],'twitterDescription':[social_desc],'canonical':[canon],'robots':[robots]};bad={k:{'expected':expected[k],'actual':actual[k]} for k in expected if expected[k]!=actual[k]};checks.append({'collection':kind,'document':node['_sys']['filename'],'path':path,'status':rr.status_code,'seo':'PASS' if not bad else 'FAIL'});
 if rr.status_code!=200 or bad:fails.append({'collection':kind,'document':node['_sys']['filename'],'path':path,'status':rr.status_code,'mismatches':bad})
for n in docs('page'):
 if n.get('draft') is True:continue
 pth=route(n.get('permalink') or n['_sys']['filename'],n['_sys']['filename']);s=n.get('seo')or{};audit('page',n,pth,s.get('metaTitle')or n.get('title')or site_title,s.get('metaDescription')or site_desc)
for n in docs('blog'):
 if n.get('draft') is True:continue
 pth=route(n.get('permalink') or n['_sys']['filename'],n['_sys']['filename']);s=n.get('seo')or{};audit('blog',n,pth,s.get('metaTitle')or n.get('title')or '',s.get('metaDescription')or n.get('description')or '')
for n in docs('category'):
 pth=route(n['_sys']['filename'],n['_sys']['filename']);s=n.get('seo')or{};audit('category',n,pth,s.get('metaTitle')or f"{n.get('title')} Articles | {site_title}",s.get('metaDescription')or n.get('description')or f"Read the latest {n.get('title')} articles from State News Central.")
for n in docs('user'):
 pth=route(n['_sys']['filename'],n['_sys']['filename'],'author');s=n.get('seo')or{};audit('user',n,pth,s.get('metaTitle')or f"{n.get('name')} Articles | {site_title}",s.get('metaDescription')or n.get('bio')or f"Read the latest articles by {n.get('name')} from State News Central.")
home=requests.get(SITE+'/?all-seo-global='+str(time.time_ns()),headers={'cache-control':'no-cache'},timeout=45).text
for n in docs('navigation'):
 labels=[]
 for i in n.get('items')or[]:
  labels.append(i.get('label')or'');labels.extend((c.get('label')or'') for c in (i.get('children')or[]))
 missing=[x for x in labels if x and x not in home]
 checks.append({'collection':'navigation','document':n['_sys']['filename'],'publicValues':len(labels),'seo':'N/A','status':'PASS' if not missing else 'FAIL'})
 if missing:fails.append({'collection':'navigation','document':n['_sys']['filename'],'missing':missing})
global_values=[site_title,(cfg.get('seo')or{}).get('logo')or'',(cfg.get('footer')or{}).get('copyrightText')or''];missing=[x for x in global_values if x and x not in home]
checks.append({'collection':'config','document':'config','publicValues':len([x for x in global_values if x]),'seo':'GLOBAL','status':'PASS' if not missing else 'FAIL'})
if missing:fails.append({'collection':'config','document':'config','missing':missing})
report={'schema':'snc-all-seo-audit-v1','site':SITE,'counts':{k:len(docs(k)) for k in ['page','blog','category','user','navigation']}|{'config':1},'checks':checks,'failures':fails,'status':'PASS' if not fails else 'FAIL'}
Path(os.environ.get('SEO_AUDIT_REPORT','seo-audit-report.json')).write_text(json.dumps(report,indent=2));print(json.dumps({'status':report['status'],'counts':report['counts'],'checked':len(checks),'failureCount':len(fails),'failures':fails},indent=2));raise SystemExit(0 if not fails else 1)
